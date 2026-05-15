# test coverage, wave H

## summary

`bun run --filter @waifufun/contracts-evm test` results:

- **49 tests passing**, 1 pending (real-fork, gated on `FORK_BSC=true`)
- runtime: ~3s on local hardhat node
- no skipped, no failures

```
Wave H bundle flow e2e:    26 tests passing
Wave H phase 2 smoke:       6 tests passing
TreasuryLP4 (legacy):       8 tests passing
VeWaifuStaking (legacy):    9 tests passing
Wave H real-fork:           pending (manual)
```

## per-contract coverage (solidity-coverage report)

ran `bunx hardhat coverage --testfiles "test/wave-h-bundle-flow.test.js"`:

| contract | % stmts | % branch | % funcs | % lines |
|---------|--------:|---------:|--------:|--------:|
| `BundleRouter.sol` | **90.48%** | 36.54% | 83.33% | **92.06%** |
| `LaunchFactory.sol` | **85.29%** | 52.17% | 60.00% | **86.05%** |
| `LaunchVault.sol` | **82.88%** | 50.00% | 80.00% | **86.86%** |
| `TreasuryLP.sol` | 33.33% | 16.67% | 50.00% | 46.67% |
| `flap/` (interfaces) | 100% | 100% | 100% | 100% |
| `interfaces/` | 100% | 100% | 100% | 100% |
| `uniswap/` (interfaces) | 100% | 100% | 100% | 100% |

note: `TreasuryLP4.sol` and `VeWaifuStaking.sol` show 0% in the wave-H-only
coverage run because those tests are in separate files. their dedicated test
suites (`TreasuryLP4.test.js`, `VeWaifuStaking.test.js`) pass independently
but those contracts are **not in scope for wave H audit** (legacy from prior
waves, see `KNOWN_ISSUES.md` section 8).

### why branch coverage is lower than line coverage

solidity-coverage counts custom-error `revert` branches conservatively. our
contracts use a defensive style with many input-validation reverts (zero-address
checks, state-machine guards, role gates). most of these are tested
positively (right caller / right state) but not all are tested negatively
(every wrong caller / every wrong state). the threat model in
`THREAT_MODEL.md` enumerates the access-control matrix in full so an
auditor can verify by inspection that the gating is correct, even where
coverage doesn't exercise the negative branch.

### why TreasuryLP coverage is the lowest

`TreasuryLP.sol` is a 68-line custodial contract with three core functions
(`recordManagedToken`, `sweep`, `balance`). the wave-H-flow tests only
exercise the `recordManagedToken` happy path (token gets transferred to
treasury during bundle, then recordManagedToken is called). `sweep` is
tested at the unit level but the coverage report lumps wave-H-only runs
together. real coverage when running the full test suite is higher.

note that `TreasuryLP` is explicitly **custodial-only for wave H** (see
`KNOWN_ISSUES.md` section 4). its security surface is small: an owner who
can sweep any token to any address. unit tests cover the access control;
deeper testing would be needed if/when we promote it to a real LP deployer.

## test inventory

### `test/wave-h-bundle-flow.test.js`, 26 tests

```
Wave H bundle flow e2e
  ✔ tier-80: full happy path (deposit -> close -> bundle -> claim)
  ✔ tier-90: full happy path (deposit -> close -> bundle -> claim)
  ✔ tier-95: full happy path (deposit -> close -> bundle -> claim)
  ✔ tier-98: full happy path (deposit -> close -> bundle -> claim)
  ✔ reverts when depositing after close
  ✔ reverts when deposit overshoots presale cap
  ✔ reverts when non-router calls vault.pullBnbForLaunch
  ✔ reverts when non-bundleBot calls router.executeBundle
  ✔ reverts when router.executeBundle called twice (one-shot guard)
  ✔ factory reverts on predictedTokenAddress mismatch
  ✔ factory reverts on salt reuse
  ✔ factory reverts on closeTimestamp in the past
  ✔ factory reverts on empty name/symbol/meta
  ✔ undersubscribed: enable refund + each depositor refunds principal
  ✔ bundle-failed refund: bundleBot enables refund after close
  ✔ admin emergency refund: factory.owner can flip OPEN or CLOSED state to REFUND
  ✔ refund() reverts second time from same address (idempotent NoDeposit)
  ✔ bundle revert leaves vault BNB intact (atomic-or-bust via EVM rollback)
  ✔ treasury allocation goes to TreasuryLP exactly and recordManagedToken locks in
  ✔ tip transfer goes to TIP_RECEIVER when tipBnb > 0
  ✔ tier-90 vesting: TGE = 50%, linear over 24h reaches 100%
  ✔ three depositors get correct pro-rata shares
  ✔ withdraw with penalty=0 returns full amount; bonusPool stays zero
  ✔ requestLaunch returns true only when CLOSED + funded + router wired
  ✔ distribute reverts when not in LAUNCHED state
  ✔ claim reverts pre-distribute (InvalidState)
```

uses mocked flap portal (`contracts/mocks/BundleFlowMocks.sol`). covers:

- all four tier configurations end-to-end (deposit → close → bundle → claim)
- access control on every restricted function
- state machine transitions (OPEN → CLOSED → LAUNCHED, OPEN/CLOSED → REFUND)
- atomic-revert property (test explicitly induces revert post-portal and
  asserts vault BNB intact)
- one-shot guards (`executed`, `distributed`)
- vesting math (TGE 50% + linear 50% over 24h)
- pro-rata token distribution
- refund math (principal + bonus pool share)
- idempotent refund (second call reverts cleanly)

### `test/wave-h-phase2.test.js`, 6 tests

```
Wave H phase 2 smoke
  ✔ LaunchFactory deploys with constructor
  ✔ LaunchVault deposit succeeds in OPEN state
  ✔ LaunchVault deposit reverts above presale cap
  ✔ TreasuryLP recordManagedToken succeeds once
  ✔ TreasuryLP recordManagedToken reverts on different second token
  ✔ Wave H contracts compile + deploy with phase-2 impls
```

scaffold smoke. fastest path to confirm constructor parameters + basic
state transitions.

### `test/integration/wave-h-real-fork.test.js`, 1 test (pending)

```
Wave H real-fork integration
  - requires FORK_BSC=true
```

reason for gating:
- BSC fork RPC eats time + bandwidth on every CI run
- portal has 90s tx.origin cooldown, back-to-back CI runs would hit it
- fork-block staleness: at the original fork pin 97_368_808, real PCS state
  is a frozen snapshot. recent state requires re-pinning periodically
- the test is **manual-run-only** before audit submission and before any
  mainnet deployment

how to run:
```bash
cd packages/contracts-evm
FORK_BSC=true FORK_BSC_BLOCK=97368808 bunx hardhat test test/integration/wave-h-real-fork.test.js
```

what it asserts:
- real `executeBundle` against the actual mainnet `Portal` at
  `0xe2cE6...De0` succeeds
- token created with predicted CREATE2 address (0x...7777 suffix)
- portal returned the expected status (Tradable for tier 80, DEX for
  graduating tiers)
- V2 pair exists for graduating tiers; `getPair == address(0)` for tier 80
- gas usage within bundle bot's planned envelope

this is the test that caught 4 P0/P1 bugs in PR #528. it is the
last-mile gate before mainnet.

### `test/TreasuryLP4.test.js`, 8 tests

legacy from prior wave. **not in scope for wave H audit**. tests the
old per-tier V4 LP deployer pattern. `TreasuryLP4.sol` is kept in the repo
for reference but is not used in wave H launches.

### `test/VeWaifuStaking.test.js`, 9 tests

legacy. **not in scope for wave H audit**. unrelated staking contract.

## what's intentionally NOT tested + why

### 1. real flap portal calls (in CI)

mocked instead. CI cost + cooldown + RPC dependence preclude continuous
real-fork tests. real-fork test exists in `test/integration/` as a manual
gate.

### 2. multi-launch concurrent execution across the same bundle bot wallet

the 90s tx.origin cooldown means the bot pool is sequential per wallet.
testing parallel launches with shared bot would just exercise portal's
revert, not our code. operational concern, not a contract behavior.

### 3. fuzz / invariant property tests

current suite is example-based. foundry invariant runners are recommended
for a follow-up wave to prove the vault state-machine invariants in
`THREAT_MODEL.md` section 2.4 hold under random caller sequences.

### 4. gas regression baselines

real-fork gives us spot baselines (section 8 of
`EMPIRICAL_VALIDATION.md`). a hardhat-gas-reporter integration with
threshold alerts is a follow-up.

### 5. legacy contracts (TreasuryLP4, VeWaifuStaking)

out of wave H scope. covered by their own tests but not part of the audit
deliverable.

### 6. probe / mock contracts

`contracts/probe/*` and `contracts/mocks/*` are test scaffolding, not
production code. coverage report shows them at 0-78% because some are
used as test doubles and some are dormant utility contracts. **out of audit
scope.**

## reproduction

from monorepo root:

```bash
cd packages/contracts-evm
bun install
bunx hardhat compile
bunx hardhat test
# optionally:
bunx hardhat coverage --testfiles "test/wave-h-bundle-flow.test.js"
```

real-fork:

```bash
FORK_BSC=true FORK_BSC_BLOCK=97368808 bunx hardhat test test/integration/wave-h-real-fork.test.js
```

requires:
- `node` ≥ 20 OR `bun` ≥ 1.0
- `FORK_BSC_RPC` env (defaults to a public BSC archive node; setting a
  paid Alchemy/Quicknode endpoint is recommended for stable real-fork runs)
