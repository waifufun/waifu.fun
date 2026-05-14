# known issues + non-goals, wave H

what we know is sub-optimal but ship anyway, and why. these are accepted risks
with conscious rationale. if a finding contradicts something here, please raise
it; we want to hear if our reasoning is wrong.

read alongside `THREAT_MODEL.md` for the security framing.

## 1. TreasuryLP is custodial-only for wave H

`TreasuryLP.sol` receives 10% of the bundle-token slice. for wave H it is a
custodial holder: `owner` (the launch creator at construction time) can call
`sweep(to, token, amount)` and walk away with the entire allocation.

why we ship this:
- the originally planned V3 CLAMM single-sided LP deployer is a much larger
  surface (uniswap v3 nfpm integration, tick math, fee tier selection, position
  manager hookup). spinning that up adds 3-4 weeks and a full second audit cycle.
- the on-chain commitment surface is still valuable: the tokens land in a
  named per-launch contract with one mutating function. creator behavior is
  visible on-chain. this is strictly better than the alternative of sending
  the 10% directly to the creator EOA.

follow-up wave plan: wave I will introduce `TreasuryLPv2` that owns a
single-sided V3 position above the current price. `sweep` will be restricted
to a V3-deployer-only path. wave H `TreasuryLP` instances will be left in
place for existing launches.

user-facing implication: ui copy must be explicit that "treasury LP is held in
custody by the launch creator during wave H." anyone consuming launchpad UX
should understand this is a "trust the creator" zone, not a "rug-resistant
contract" zone.

## 2. 4-wallet bundle bot pool is operationally trusted

the `bundleBot` field on each `BundleRouter` is an EOA from a 4-key hot
wallet pool. that EOA can:
- call `executeBundle` with arbitrary `tipBnb` (capped by vault balance via
  the `InsufficientFunding` check).
- call `enableRefundBundleFailed` on the corresponding vault after CLOSED.

a compromised bot key on a single launch can grief that launch by either:
- maxing tip to drain vault BNB to 48 Club EOA, OR
- never calling `executeBundle` AND never enabling refund (leaving vault
  stuck in CLOSED).

what protects funds:
- token splits are hardcoded (`Y/2` → DEAD, `Y/10` → TreasuryLP, remainder
  → vault). bot CANNOT redirect tokens to an attacker-controlled address.
- vault BNB can only flow to: the router (which then splits to portal,
  PCS, 48 Club, dust to DEAD), or back to depositors via refund. there is
  no path from vault BNB to an arbitrary attacker address.
- the factory owner has an emergency `adminEnableRefund` kill switch that
  bypasses bot non-cooperation.

operational mitigations (off-chain, out of audit scope):
- KMS / HSM custody of bot keys, not bare files.
- rotation: 4-key pool means a single compromise affects ~25% of in-flight
  launches.
- balance alerts: ops monitors `next_available_ts` and per-wallet balance.
- bot wallet pool is **separate from any treasury wallet**. each pool wallet
  holds only gas budget (~0.5 BNB) plus tip headroom.

follow-up wave plan: per-launch ephemeral bot keys (deterministically derived,
sealed in a TEE). out of scope for wave H.

## 3. real-fork tests are gated on portal 90s cooldown

`test/integration/wave-h-real-fork.test.js` is marked `pending` in standard
test runs. it is run manually with `FORK_BSC=true`.

why not in CI:
- BSC fork RPC consumes bandwidth + RPC quota on every commit.
- portal's 90s tx.origin cooldown means consecutive CI runs against fresh
  forks share the same signing address if the fork-snapshot reuses state.
- the original fork-block pin (`97_368_808`) is stale relative to a moving
  mainnet head. requires periodic re-pinning to maintain freshness.

operational policy: run the real-fork test before every commit that touches
contract behavior, and before the mainnet deployment of each new contract
version. it is the last-mile sanity gate, not a continuous regression check.
this is the test that caught **4 P0/P1 bugs in PR #528** before audit
submission.

## 4. no upgrade pattern; per-launch contracts are immutable

`LaunchFactory`, `LaunchVault`, `BundleRouter`, and `TreasuryLP` are all
deployed without proxy. once deployed they cannot be upgraded.

why:
- the bundle is an atomic-or-bust transaction. upgrade paths add per-call
  proxy gas and lookup risk. wave H prioritizes auditability over
  upgradability.
- there are no admin functions that depend on logic-upgradability. factory
  owner has only `transferOwnership` and `adminEnableRefund` on individual
  vaults. nothing requires patching after deploy.
- the singleton factory IS replaceable by deploying a new one and pointing
  the backend at it for new launches. existing launches continue to use
  their original factory. clean migration path without proxies.

implications:
- a vulnerability discovered post-deploy in an active launch CANNOT be
  patched on-chain. the factory owner can kill switch new launches by
  deploying a new factory, but in-flight launches must finish via either
  successful bundle OR `adminEnableRefund`.
- this is a forcing function for the audit: any blocking finding has to
  be addressed pre-deploy.

## 5. factory owner is an EOA in initial deployment

`LaunchFactory.owner` is set to `msg.sender` of the deploy tx. for initial
mainnet deployment that will be a single EOA.

mitigations planned:
- migrate ownership to a 2-of-3 gnosis safe multisig within 30 days of
  initial mainnet deploy.
- in the meantime, the owner key is held offline (hardware wallet).
- owner has no fund-drain capability; only kill-switch authority. damage
  from key compromise is limited to flipping live launches to REFUND,
  which is a service disruption, not a theft.

## 6. no per-launch vesting configuration

`LaunchVault` hardcodes:
- `VESTING_WINDOW = 86_400` (24 hours)
- `VESTING_TGE_BPS = 5_000` (50% at TGE)
- `VESTING_LINEAR_BPS = 5_000` (50% linear over the window)
- `vestingEnabled` is a boolean per launch (off for tier 80, on for tier 90+).

we cannot per-launch tune the TGE percentage, vesting window length, or curve
shape. each tier has one fixed vesting profile.

follow-up wave plan: parametric vesting. wave H ships fixed.

## 7. no public mempool fallback for failed Puissant submissions

if 48 Club Puissant is unavailable or rejects our private submission for any
reason, the bundle bot retries 3 times with escalating tip (0.03 → 0.05 → 0.10
BNB), then enables refund.

we do NOT fall back to the public mempool. reasoning from
`PUISSANT_TIP_RESEARCH.md`: a public-mempool atomic launch can be sandwiched
or front-run by a generalized MEV bot. accepting a refund is safer than
risking a stolen launch.

implication: a long Puissant outage = a stretch of failed launches +
refunds, not silent degradation. operational alerting on Puissant health
is mandatory.

## 8. legacy contracts in repo are out of audit scope

the `contracts-evm` package contains legacy contracts kept for backward
compatibility:

- `TreasuryLP4.sol`, wave G's per-tier V4 LP deployer. used by existing
  pre-wave-H launches. not used by wave H.
- `VeWaifuStaking.sol`, unrelated staking contract from an earlier system
  design.
- `contracts/probe/`, probe-only contracts (FlapBundleProbe, MinimalWrapper).
  not deployed in production.
- `contracts/mocks/`, test doubles. not deployed in production.

**explicit scope for audit:**

| file | status |
|------|--------|
| `BundleRouter.sol` | IN SCOPE |
| `LaunchFactory.sol` | IN SCOPE |
| `LaunchVault.sol` | IN SCOPE |
| `TreasuryLP.sol` | IN SCOPE |
| `flap/FlapTypes.sol` | IN SCOPE (interfaces) |
| `flap/IFlapPortal.sol` | IN SCOPE (interfaces) |
| `interfaces/*` | IN SCOPE (interfaces) |
| `uniswap/*` | IN SCOPE (interfaces) |
| `TreasuryLP4.sol` | OUT OF SCOPE (legacy) |
| `VeWaifuStaking.sol` | OUT OF SCOPE (legacy) |
| `probe/*` | OUT OF SCOPE (probe-only) |
| `mocks/*` | OUT OF SCOPE (test scaffolding) |

## 9. flap portal is third-party untrusted infrastructure

we do not control `Portal` at `0xe2cE6...De0`. if flap upgrades portal to
v5.15.x or v6.x with different semantics, our wave H contracts may break.
specifically at risk:
- the predicted-CREATE2 address may no longer match the deployed address
  (our router reverts `PredictedAddressMismatch`).
- the curve graduation threshold may change (our 20 BNB quoteAmt may stop
  graduating, causing `PairNotCreated` revert).
- the `commissionReceiver` flow may change (our commission may stop arriving).
- the `tx.origin` rate-limit window may change (operational throughput shift).

we have no on-chain defense against these. operational response:
- pin spec to portal v5.14.1 explicitly.
- monitor portal contract for new events / interface changes.
- if portal upgrades and breaks us, factory owner uses `adminEnableRefund`
  on all in-flight launches and deploys a new factory targeting the new
  portal version.

## 10. no formal verification

the wave H suite is example-based. specifically:
- no foundry / forge invariant runners over the vault state machine.
- no certora / halmos / scribble rules for vault BNB conservation.
- no symbolic execution over `executeBundle` paths.

example tests do exercise:
- all four tier paths happy-path
- all reverts on access control
- atomic-revert property (induced via mock)
- one-shot guards
- pro-rata math
- vesting math

example tests do NOT exhaustively prove:
- vault BNB invariant under arbitrary deposit/withdraw/refund sequences
- claim ceiling under all vesting-time-warp scenarios
- splits sum to total under arbitrary bot-supplied params

follow-up wave plan: certora rules over `LaunchVault` state machine + a
foundry invariant suite over `BundleRouter` accounting.

## 11. dust-burn-on-success

at the end of a successful `executeBundle`, any leftover BNB in the router
is swept to `0x...dEaD`. this is intentional (no router state custody
post-bundle, no path for stuck BNB to ever leave the router) but it means:
- if someone pre-funds the router with BNB before the bundle, that BNB is
  burned at the end. wave H per-launch routers are deployed-then-bundled
  in a short window, so the surface for accidental pre-funding is small.
- expected dust is on the order of a few thousand wei (rounding crumbs
  from the BNB pulled vs spent).

acceptable destruction. mentioned for completeness.

## 12. salt mining is off-chain

vanity salts ending in `0x...7777` are mined off-chain by the
`packages/launchpad-salt-miner/` worker before `createLaunch` is called.
the on-chain factory only validates that `predictedTokenAddress == CREATE2(...)`
using the supplied salt; it does not regenerate or mine.

implications:
- a malicious frontend could supply a non-`7777`-suffix predicted address
  and bypass vanity. on-chain factory CANNOT detect this, only the address
  matching CREATE2 is enforced. mitigations: frontend / backend validation
  + manual review of launch metadata.
- mining is deterministic given (impl, portal, salt), anyone can verify
  the salt off-chain.

not an issue with the contracts; an integration concern between the salt
miner and the factory call.

## 13. tax rates enforced one layer down

the factory rejects `buyTaxBps > 10000 || sellTaxBps > 10000` but accepts
any value in `[0, 10000]`. flap portal then independently rejects anything
not in `{0, 100, 300, 500, 1000}` at the `newTokenV6` call.

result: if a creator passes e.g. `buyTaxBps = 200`, factory accepts but
`executeBundle` reverts when portal rejects. vault BNB stays put, refund
path opens, ux shows "bundle failed". no funds at risk.

this is correctness-by-rejection, not strictly defensive. accepted because:
- the legal tax values may change as flap upgrades; hardcoding the
  allow-list in our factory would create a maintenance burden.
- the failure mode is a clean revert + refund, not a silent issue.

## 14. monitoring + alerting are off-chain

the contracts emit events sufficient for an indexer to track:
- `LaunchCreated` (factory)
- `Deposited`, `Withdrawn`, `Closed`, `LaunchExecuted`, `Distributed`,
  `RefundEnabled`, `Refunded`, `Claimed` (vault)
- `BundleExecuted`, `BundleFailed` (router)
- `OwnershipTransferred` (factory)
- `TokensReceived`, `TokensSwept`, `ManagedTokenSet` (treasury)

on-chain monitoring of e.g. "vault stuck in CLOSED for > 24h" is NOT in
the contracts. operational monitoring is via the apps/launch-indexer and
apps/bundle-bot services, out of audit scope but documented in
`WAVE_H_OPERATIONAL_PLAN.md` upstream.

## 15. WBNB approval / allowance is NOT used

the V2 follow-up buy uses `swapExactETHForTokensSupportingFeeOnTransferTokens`,
which is a payable function. no token approvals needed before the swap.
the router never holds WBNB. the router never approves any contract for
its own tokens (it `safeTransfer`s tokens to DEAD / treasury / vault
directly).

mentioned for completeness, there is no allowance-griefing surface in
`BundleRouter`.

## 16. frontend has no `refund()` write button — RESOLVED (Wave J)

status: resolved. `apps/frontend/src/components/launch-page/refund-widget.tsx`
wires the `refund()` write via wagmi's `useWriteContract`, replaces the
deposit widget in the `displayState='refunding'` branch of
`launch-page-client.tsx`, and surfaces principal + pro-rata bonus share
+ total via the pure helpers in `refund-widget-logic.ts`. error normalization
covers user rejection, the `NoDeposit()` revert (second-call idempotency),
and the `InvalidState()` revert. tests:

- vitest unit coverage of bonus math + error mapper in
  `refund-widget-logic.test.ts`
- vitest mapper coverage of the `vaultState === REFUND` priority path in
  `launch-display-state.test.ts`
- playwright e2e smoke in `tests/e2e/refund-flow.spec.ts` covering the
  failed-pill render on the launches index

follow-ups still open:
- full launch-detail e2e requires a SPA id-resolution patch (today
  `/launch/[id]` short-circuits to NotFound when the prerendered shell
  resolves `id="_"` at build time; needs `useParams` on the client to
  override). tracked as a separate issue, not blocking the refund flow.
- the widget assumes the vault snapshot's `bonusPool` is current; if the
  indexer is offline the bonus row may show 0 until on-chain reads catch
  up. principal is always sourced from the depositor mapping so the
  refund button still reflects the right intent.

## 17. frontend `VaultState` enum missing REFUND — RESOLVED (Wave J)

status: resolved in the same PR as gap 16. `apps/frontend/src/lib/launch-vault/abi.ts`
now mirrors all four on-chain enum values: `{ OPEN: 0, CLOSED: 1, LAUNCHED: 2,
REFUND: 3 }`. the `deriveLaunchDisplayState` mapper takes the on-chain
REFUND state as the most authoritative signal, ahead of the
backend `status='failed'` fallback, so a user reading the chain directly
resolves to `displayState='refunding'` even when the indexer is laggy.
the abi event mirrors were also corrected: `RefundEnabled(address, string)`
replaces the stale `RefundsEnabled()` placeholder, and `LaunchExecuted`
replaces the unused `Launched` event name.

## 18. `enableRefundUnderSubscribed` has no automated trigger

spec section 6.1 calls this "anyone calls permissionlessly" after
`closeTimestamp + undersubscribed`. no off-chain service in `apps/`
currently calls it. a launch that closes under-subscribed will sit at
on-chain state OPEN/CLOSED until either a presaler or ops manually
invokes the function.

impact: refunds are delayed until manual trigger, not blocked. once
triggered, the path works correctly.

follow-up: tier-cron sweeper that scans for
`closeTimestamp < now() - grace AND totalDeposited < cap AND state != REFUND`
and fires the call. low-cost addition. tracked in user-flow coverage
matrix as gap 18.

## 19. bundle-submitter does not auto-call `enableRefundBundleFailed`

`apps/api/src/services/bundle-submitter.ts:188-200` marks
`bundleStatus='failed_terminal'` on attempt 3 and returns. it does NOT
then submit a follow-up transaction calling
`LaunchVault.enableRefundBundleFailed()`. the spec (section 7.4) requires
this call so the refund path opens automatically.

impact today: a launch whose bundle fails 3x sits in vault state CLOSED
until ops manually fires either `enableRefundBundleFailed` (from the
bundle-bot wallet) or `adminEnableRefund` (from `factory.owner`). no
funds are at risk; only the refund window's opening is delayed.

why we ship: the `adminEnableRefund` kill switch is sufficient. adding
the auto-call is a follow-up engineering task. tracked in user-flow
coverage matrix as gap 19.

## 20. indexer silently no-ops on portal `TokenCreated` mismatch

`apps/launch-indexer/src/handlers/flap.ts:9-30` looks up
`agentLaunches.predictedTokenAddress = event.token` and returns `null`
if no row matches. if our predicted-CREATE2 computation drifts from
portal's (e.g. portal upgrade with new init-code) the launch is not
flagged, even though the on-chain `BundleRouter.executeBundle` would
have already reverted with `PredictedAddressMismatch`.

impact: lost observability, not lost funds. the router-level revert
guarantees the bundle either succeeds with our predicted address or
leaves vault BNB intact.

follow-up: warn-log on unmatched `TokenCreated` events so ops can
investigate portal upgrades. tracked in user-flow coverage matrix as
gap 20.

---

## non-goals (deferred to follow-up waves)

explicit list of things we explicitly do NOT implement in wave H:

1. V3 CLAMM single-sided LP for treasury (wave I)
2. per-launch tunable vesting (wave I)
3. multi-quote-token support (only BNB)
4. flap extension hooks (`extensionID = bytes32(0)` always)
5. `MAGIC_DIVIDEND_SELF` or custom dividend tokens
6. V2 pair `Swap` event indexing for tax stream
7. agent revenue dashboard
8. public mempool fallback for failed Puissant submissions
9. parametric splits other than `mktBps = 10000`
10. per-launch ephemeral bot keys
11. multi-sig governance over `factory.owner` (planned within 30 days post-deploy)
12. formal verification of state-machine invariants

these are NOT bugs. they are deliberate scope reductions to ship a small,
well-tested wave H first. each has a follow-up wave designation.
