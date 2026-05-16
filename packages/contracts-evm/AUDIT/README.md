# waifu.fun wave H, audit package

## one-paragraph summary

waifu.fun is a presale-escrow + atomic-bundle launchpad on top of flap portal
v5.14.1 on BSC. depositors fund a per-launch `LaunchVault` with BNB during an
open window. once the cap is met, a per-launch `BundleRouter` runs a single
atomic transaction that calls flap's `newTokenV6` to mint a tax-token (and
optionally graduate it to PancakeSwap V2), optionally follow-up-buys from
that V2 pool, then splits the resulting tokens 50/10/40 between a burn
address, a `TreasuryLP` custody contract, and the `LaunchVault` for
pro-rata presaler distribution. atomic-or-bust: any revert inside
`executeBundle` rolls everything back and the vault BNB is preserved for a
refund. submission goes through 48 Club Puissant private mempool; tip is
paid in-tx to the 48 Club builder EOA.

## audit package contents

| doc | purpose |
|-----|---------|
| `README.md` (this file) | index, scope, commit hash, contact |
| `ARCHITECTURE.md` | contract topology + mermaid sequence diagrams (happy path, refund, state machines) |
| `THREAT_MODEL.md` | per-contract roles, trust assumptions, attack surfaces, invariants, accepted risks |
| `EMPIRICAL_VALIDATION.md` | real-fork probe findings: portal version, cooldown, V6 semantics, commissionReceiver, gas baselines, pre-audit bugs caught |
| `TEST_COVERAGE.md` | test inventory, per-contract solidity-coverage report, gaps + reproduction |
| `KNOWN_ISSUES.md` | accepted risks, non-goals, follow-up wave plans |
| `STATIC_ANALYSIS.md` | slither output + triage + accepted findings + defensive fix |
| `SECURITY_HARDENING_2026-05-16.md` | latest local agent/tool hardening pass, implemented fixes, residual verification |

## commit hash + tag

audit target: tag **`v1.0.0-pre-audit`** on branch `sol/audit-prep-package`.
the last code-touching commit on the parent branch is
`26ef0aa3e67a6a180f3bb9e0c04cb42f5cc008c4`; the audit-prep commit on top adds
documentation only (no contract or test changes). resolve the tag locally to
the canonical audit commit hash:

```bash
git rev-parse v1.0.0-pre-audit
```

## scope

### in scope

contracts under `packages/contracts-evm/contracts/`:

| file | description | LOC |
|------|-------------|----:|
| `BundleRouter.sol` | per-launch atomic executor; one entry point `executeBundle` | 339 |
| `LaunchFactory.sol` | singleton; deploys per-launch trio (vault + router + treasury) | 282 |
| `LaunchVault.sol` | per-launch BNB escrow + state machine + claim/refund logic | 387 |
| `TreasuryLP.sol` | per-launch custodial holder for 10% token allocation | 68 |
| `flap/FlapTypes.sol` | enums + structs matching portal v5.14.1 |, |
| `flap/IFlapPortal.sol` | minimal interface for `newTokenV6` |, |
| `interfaces/*.sol` | misc shared interfaces |, |
| `uniswap/*.sol` | PCS V2 factory / router / pair interfaces |, |

total in-scope contract LOC: ~1076 (production) + ~50 (interfaces).

### out of scope

- `contracts/TreasuryLP4.sol`, legacy per-tier V4 LP deployer from a prior wave.
  kept in repo for backward compat; not used by wave H launches.
- `contracts/VeWaifuStaking.sol`, unrelated staking contract.
- `contracts/probe/*`, empirical probe contracts (FlapBundleProbe, MinimalWrapper).
  not deployed in production.
- `contracts/mocks/*`, test scaffolding only.
- off-chain components: apps/launch-indexer, apps/bundle-bot,
  packages/launchpad-salt-miner. some of these are referenced in
  `THREAT_MODEL.md` for trust assumptions but their code is not part of this
  audit.
- third-party infrastructure: flap portal contracts, PancakeSwap V2 contracts,
  WBNB, 48 Club Puissant relay.

## how to audit

```bash
# clone
git clone https://github.com/waifufun/waifu.fun.git
cd waifu.fun
git checkout v1.0.0-pre-audit

# install
bun install
cd packages/contracts-evm

# compile
bunx hardhat compile

# run unit tests (86 tests, ~4s; one gated fork test is pending unless FORK_BSC=true)
bunx hardhat test

# coverage report
bunx hardhat coverage --testfiles "test/wave-h-bundle-flow.test.js"

# real-fork integration test (requires FORK_BSC_RPC env)
FORK_BSC=true FORK_BSC_BLOCK=97368808 bunx hardhat test test/integration/wave-h-real-fork.test.js
```

## third-party dependencies / addresses

all BSC mainnet, chainId 56:

| name | address | trust |
|------|---------|-------|
| flap portal v5.14.1 | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` | third-party untrusted (treated as adversarial in threat model) |
| TOKEN_TAXED_V3 impl (CREATE2 base) | `0x024f18294970B5c76c0691b87f138A0317156422` | empirically verified, see EMPIRICAL_VALIDATION |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | trusted |
| PCS V2 factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` | trusted |
| PCS V2 router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` | trusted |
| 48 Club builder EOA | `0x4848489f0b2BEdd788c696e2D79b6b69D7484848` | tip target, trust-not-required |

## non-trivial design decisions

1. **per-launch trio, no shared mutable state.** each launch deploys a fresh
   `LaunchVault` + `BundleRouter` + `TreasuryLP`. cross-launch state sharing
   is limited to `LaunchFactory.usedSalts` and `launches[]`. rationale: trust
   isolation, no cross-launch reentrancy surface.
2. **bundle is atomic-or-bust.** any revert inside `executeBundle` rolls back
   the BNB pull from vault. vault BNB is always conserved if the bundle does
   not complete fully. verified in test and via EVM atomicity property.
3. **router uses CEI with one-shot guard.** `executed = true` is set BEFORE
   any third-party call. reentry through a malicious token's transfer hook
   lands on `AlreadyExecuted`. no separate reentrancy guard library.
4. **vault uses openzeppelin ReentrancyGuard.** standard `nonReentrant` on
   all state-mutating user-facing functions. CEI pattern in `refund()` and
   `claim()` for defense in depth.
5. **dynamic token splits.** router reads `IERC20(token).balanceOf(this)`
   after the V2 buy and computes splits dynamically. does NOT hardcode
   per-tier numbers, because `FlapTaxTokenV3` is fee-on-transfer (V2 buy
   returns post-tax tokens).
6. **dust sweep to DEAD.** post-bundle BNB dust is swept to `0x...dEaD`.
   router holds zero persistent custody. no `sweep()` function, no `owner`
   on the router. rationale: minimize post-bundle attack surface.
7. **refund is permissionless after closeTimestamp if undersubscribed.**
   `enableRefundUnderSubscribed` is callable by anyone after the close
   timestamp passes with `totalDeposited < presaleCap`. depositors don't
   need to wait for bot or owner cooperation for under-cap launches.
8. **bundle bot has limited authority.** can only call `executeBundle` once
   per router; cannot redirect tokens; cannot drain vault to attacker;
   max-loss surface is tip-griefing within `vault.balance` cap.

## verification log

- 2026-05-11 to 2026-05-13: 12 empirical probes against real flap portal at
  fork block 97_368_808. findings in `EMPIRICAL_VALIDATION.md`.
- PR #519: cooldown characterization (90s tx.origin window).
- PR #520: backend tax accessor fix + bundle wallet pool.
- PR #521: V6/V7 characterization + commissionReceiver verification.
- PR #525: wave H phase 2b, vault/factory/treasuryLP implementation.
- PR #526: phase 2c, real-fork integration tests.
- PR #527: codex review pass, `safeTransfer`, internal vesting helper.
- PR #528: real-fork bundle test caught 4 P0/P1 bugs before audit:
  1. wrong TOKEN_TAXED_V3 impl address
  2. graduation threshold (16 BNB does NOT graduate, 20 BNB does)
  3. tier 80 hardcoded `PairNotCreated` check broke curve-only flow
  4. tier math corrections

all four were fixed pre-audit. real-fork test is gated on `FORK_BSC=true`
because of the 90s cooldown + RPC dependence. see `TEST_COVERAGE.md` for
the operational gate policy.
- 2026-05-16: local multi-agent hardening pass added creator-only launch
  creation, factory-approved bundle param binding, fee-on-transfer distribution
  accounting, restricted treasury token registration, permissionless
  launch-expired refunds, staking reward funding enforcement, and updated tests.
  see `SECURITY_HARDENING_2026-05-16.md`.

## contact

on-chain identifier (deployer-funding wallet, public): Sol's burner address on
Base, `0xC9846a839c4e1D9050Dc890A25661AB13224e9EC`. note this is a Base L2
identity; production deploys on BSC will use a separate funded EOA. this
address is provided so auditors can verify on-chain commitments / sign messages
back if a public statement is needed.

primary contact for audit clarifications: Shadow (wakesync) via the audit
firm's communication channel.

repository: `waifufun/waifu.fun` (private; audit firms granted access on
engagement start).
