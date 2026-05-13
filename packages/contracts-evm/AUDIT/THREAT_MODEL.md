# wave h threat model

per-contract roles, trust assumptions, attack surfaces, invariants, and accepted
risks. honest. if a thing is sub-optimal but accepted for wave H, it's called
out here.

read alongside `ARCHITECTURE.md`. cross-referenced empirical findings live in
`EMPIRICAL_VALIDATION.md`.

## 0. shared assumptions

- BSC mainnet, chainId 56. no other EVM chain in scope.
- solidity 0.8.24, openzeppelin contracts v4.9.6, no upgradeable proxies.
- flap portal v5.14.1 at `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` is treated
  as third-party untrusted infrastructure that we have empirically characterized
  but do not control. we do not assume it is benign; we assume it is consistent
  with its current bytecode and event surface.
- pancakeswap V2 router/factory are treated as benign. these are the canonical
  PCS contracts; we are not auditing them.
- the bundle bot is a hot wallet rotating across a 4-EOA pool. operationally
  trusted to call `executeBundle` correctly. key custody is via KMS off-chain
  (out of scope for this audit; see `KNOWN_ISSUES.md` section 2).
- a single launch is the unit of trust isolation: per-launch `LaunchVault`,
  `BundleRouter`, and `TreasuryLP` are deployed by the factory. there is no
  cross-launch state sharing other than `LaunchFactory.usedSalts` and
  `LaunchFactory.launches[]`.

## 1. LaunchFactory

singleton. only owner-mutable state is `owner` (transferable).

### 1.1 roles

| role | bound to | what they can do |
|------|----------|------------------|
| owner | `factory.owner` (storage) | `transferOwnership`, `LaunchVault.adminEnableRefund` on any vault |
| caller of `createLaunch` | anyone | deploy a new launch trio with their own config |

### 1.2 trust assumptions

- `INIT_CODE_HASH` is provided by the deployer at construction time and is
  immutable. it MUST be the EIP-1167 minimal-proxy init code hash for the
  flap `TOKEN_TAXED_V3` impl. computed off-chain, verified once during
  deployment.
- `FLAP_PORTAL` is the actual portal address. if the deployer wires this to
  a malicious address, every downstream launch is compromised. trust placed
  in the deployer of the singleton factory.
- `commissionReceiver` per launch is supplied by the creator. they can route
  flap tax-stream commission BNB anywhere, including back to themselves.
  this is by design (each creator picks their own platform fee wallet)
  but it means the factory does NOT enforce that all launches share a
  platform-wide fee receiver.

### 1.3 attack surfaces

- **anyone can call createLaunch with any creator address.** the factory does
  NOT enforce that `msg.sender == creator`. this is intentional (so a backend
  service can deploy launches on behalf of SIWE-authenticated users), but it
  means a third party could front-run a creator and deploy their launch with
  unfavorable bundleBot / commissionReceiver. mitigation: the SIWE flow
  produces an off-chain authorization that the backend submits with the
  correct `creator`/`bundleBot`. on-chain there is no protection.
- **salt grinding griefing.** `usedSalts[salt]` is a global mapping. a
  griefer who knows the target predicted address can call `createLaunch`
  first with a throwaway config to burn the salt. cost: 1 createLaunch gas
  fee (~3.3M gas). mitigation: salts are derived off-chain per-creator
  (`launchId = keccak256(creator, salt)`) so a griefer would have to mine
  THEIR address into a 0x...7777 suffix, which is the same 1-in-65536
  cost they imposed on us, not a useful asymmetric attack. accepted risk.
- **factory.owner is a single key.** if compromised, owner can flip every
  vault to refund mode (admin kill switch). they cannot drain funds; the
  vault always pays principal + bonus to the original depositors. accepted
  risk; reduced via owner being a multisig in production deployment (NOT
  yet in scope for wave H, see `KNOWN_ISSUES.md` section 5).
- **no allow-list on tax rates above 1000 bps**. the factory rejects
  `buyTaxBps > 10000 || sellTaxBps > 10000` but otherwise accepts anything
  the creator passes. flap portal will reject anything not in {0, 100, 300,
  500, 1000} at the `newTokenV6` call, so the bundle will revert and the
  vault refunds. no on-chain factory-level guard is needed; this is enforced
  one layer down.

### 1.4 invariants

- `usedSalts[salt]` is monotonic (true once set, never unset).
- `allLaunches.length` is monotonic.
- `launches[predicted].vault/router/treasuryLp` are set once per
  `createLaunch` call and never updated.
- `owner` can only change via `transferOwnership(newOwner != address(0))`.

### 1.5 known limitations / accepted risks

- no per-creator rate limit on `createLaunch`. a spammer can deploy unlimited
  empty launches. each createLaunch consumes ~3.3M gas (~$5-10 at typical
  BSC gas prices) so this is a self-rate-limiting DoS via fee burn. accepted.
- the factory does not validate `commissionReceiver`. if the creator sets
  it to `address(0)`, flap portal handles that as "all commission to flap's
  global receiver" and our platform earns 0. backend logic prevents this in
  the happy path. accepted as a creator footgun.

## 2. LaunchVault

per-launch escrow. all depositor BNB lives here until either claim or refund.

### 2.1 roles

| role | bound to | what they can do |
|------|----------|------------------|
| factory | `vault.factory` immutable | one-shot `setRouter` during createLaunch |
| creator | `vault.creator` immutable | nothing on-chain (informational only, wave H does not give the creator any special vault privileges) |
| bundleBot | `vault.bundleBot` immutable | `enableRefundBundleFailed` after close |
| router | `vault.router` storage (set once) | `pullBnbForLaunch`, `distribute` |
| factoryOwner | `factory.owner` (read live) | `adminEnableRefund` |
| anyone | n/a | `deposit`, `withdraw[All]`, `close` (when conditions met), `enableRefundUnderSubscribed`, `refund`, `claim` |

### 2.2 trust assumptions

- the router is trusted to call `pullBnbForLaunch` with the correct amount and
  to call `distribute` exactly once after a successful bundle. the router's
  one-shot `executed` flag guarantees this.
- the bundle bot is operationally trusted to either run the bundle OR enable
  refund. if it does neither, the vault is stuck in CLOSED state with all
  BNB intact. backstop: `enableRefundUnderSubscribed` is permissionless
  AFTER `closeTimestamp` if `totalDeposited < presaleCap`, so an under-cap
  vault always has an exit. for over-cap vaults the only exit is the bot
  triggering `enableRefundBundleFailed` or owner triggering
  `adminEnableRefund`. **this is the principal griefing surface for the bot
  and the factory owner.**

### 2.3 attack surfaces

- **reentrancy.** all state-mutating user-facing functions (`deposit`,
  `withdraw`, `withdrawAll`, `refund`, `claim`) use openzeppelin's
  `ReentrancyGuard.nonReentrant`. `pullBnbForLaunch` and `distribute` are
  router-gated and use the router's one-shot `executed` flag for replay
  protection. CEI is followed throughout (`refund` zeroes state before
  the BNB call; `claim` increments `claimed` before `safeTransfer`).
- **erc777 / hook tokens on claim.** the claim token is a flap
  `FlapTaxTokenV3` clone, which is fee-on-transfer but NOT erc777. it
  does not have a recipient hook. `safeTransfer` is safe.
- **deposit front-running on cap.** depositor A submits a deposit of
  `presaleCap - 1` BNB; depositor B sees the mempool, front-runs a
  matching deposit to push themselves into the share count. accepted ,
  this is the standard "presale rush" UX, not an exploit. mitigations
  (whitelist / commit-reveal) are out of scope for wave H.
- **withdraw penalty griefing.** `penaltyBps` is fixed at vault deploy
  and capped at 1000 bps (10%). the factory hardcodes `penaltyBps = 0`
  in wave H so all withdraws are free. there is no griefing vector here
  until a future wave wires penaltyBps to a configurable creator field.
- **bonus pool sandwich.** with `penaltyBps == 0`, `bonusPool` is always
  zero. for completeness: if a future wave enables penalty > 0, a griefer
  could withdraw small amounts to pump bonus pool, then have a confederate
  deposit a large amount right before close. the pro-rata math gives the
  large depositor a disproportionate bonus share. mitigated only by
  setting penaltyBps modestly and accepting the bonus-pool tax. wave H
  ships with penalty=0 so this is dormant.
- **refund denial by stuck state.** if a vault reaches CLOSED but the bot
  never executes the bundle AND never calls `enableRefundBundleFailed`,
  AND the factory owner never calls `adminEnableRefund`, depositors are
  stuck. they cannot self-trigger refund post-cap. accepted, this is the
  trust placed in the bot + owner. partial mitigation: timelock for owner
  to call adminEnableRefund automatically after some `closeTimestamp + N`
  is a follow-up wave proposal, not in scope here.
- **executor griefing via gas exhaustion.** bot calls `executeBundle` with
  a low gas limit so step 5 (token splits) silently fails. the router
  reverts entirely (no try/catch around splits), so the bundle does not
  partially succeed. accepted, a low-gas bundle is a no-op, vault remains
  in OPEN/CLOSED, retry possible.
- **vault `receive()` reverts.** raw BNB sent to vault outside `deposit()`
  is rejected. router-side pullBnb uses a low-level call back to router
  (not a fallback to vault), so the refund-path BNB flow does not pass
  back through vault's `receive`. no surprise BNB accumulates in the vault.

### 2.4 invariants (informal, not yet formally verified)

- **BNB conservation in OPEN:** `address(this).balance ==
  totalDeposited + bonusPool` whenever state ∈ {OPEN, CLOSED}.
  (bonusPool is always 0 in wave H since penaltyBps=0; trivially upheld.)
- **state monotonicity:** `OPEN → CLOSED → LAUNCHED` and
  `OPEN/CLOSED → REFUND` are the only legal transitions. no state ever
  flips backwards. `LAUNCHED` and `REFUND` are terminal.
- **distribute one-shot:** `distributed == true` implies `state == LAUNCHED`
  and `token != address(0)`.
- **refund idempotency:** post-refund, `depositors[user].deposited == 0`
  and a second `refund()` from same address reverts `NoDeposit`.
- **claim ceiling:** `depositors[user].claimed <= _vestedOf(user) <=
  presalerTokenBalance * deposited / totalDepositedAtLaunch`. dust losses
  from integer division floor to the vault, never overflow above
  `presalerTokenBalance`.
- **vault BNB intact on bundle revert:** if `executeBundle` reverts at any
  point post-`pullBnbForLaunch`, EVM atomicity rolls back the
  `pullBnbForLaunch` BNB transfer too, leaving the vault with full
  balance. verified in `wave-h-bundle-flow.test.js` (test
  "bundle revert leaves vault BNB intact").

### 2.5 known limitations / accepted risks

- closing the window does NOT auto-trigger anything. the bot must call
  `pullBnbForLaunch` (via router.executeBundle) or `enableRefundBundleFailed`.
  vaults can live in CLOSED state indefinitely if the bot fails to act.
- no per-depositor max cap. a single depositor can fill the entire vault.
  accepted; mitigated by tier sizing (tier 80 = 16 BNB, tier 98 = 160 BNB ,
  whale resistance is fundamentally a UX/marketing problem, not a contract one).
- vesting parameters are fixed in code (50% TGE + 50% linear over 24h).
  per-launch vesting tuning is a follow-up wave.
- `_allocationOfPure` floors via integer division. last depositor to claim
  may receive 1-2 wei less than their pro-rata share due to rounding.
  dust stays in vault. accepted, wei-scale.

## 3. BundleRouter

per-launch executor. one-shot. owns no persistent state post-bundle.

### 3.1 roles

| role | bound to | what they can do |
|------|----------|------------------|
| bundleBot | `router.bundleBot` immutable | call `executeBundle` exactly once |
| factory | `router.factory` immutable | nothing direct (informational) |
| vault | `router.vault` immutable | callback origin for router internal logic (router calls vault, not vice-versa) |
| anyone | n/a | `previewPairAddress` view only |

### 3.2 trust assumptions

- `executeBundle` runs to completion or reverts. EVM atomicity guarantees
  the rollback property.
- the bundle bot has already verified off-chain that the curve fill + V2
  buy slippage parameters are sane. on-chain we accept `tipBnb`,
  `minV2TokensOut`, and `deadline` as caller-supplied.
- portal honors its documented `newTokenV6` semantics for the parameters
  we pass. specifically: `beneficiary = address(this)` results in
  `msg.sender == address(this)` receiving the curve-buy tokens. verified
  empirically against portal v5.14.1; see `EMPIRICAL_VALIDATION.md`.

### 3.3 attack surfaces

- **bot key compromise.** an attacker with the bot key can call
  `executeBundle` with parameters that grief the launch:
  - inflated `tipBnb` up to `address(vault).balance - quoteAmt - v2BuyBnb`
    (limited by the `InsufficientFunding` check post-pull, which compares
    `address(this).balance` to `needed`). an attacker who set `tipBnb`
    such that `quoteAmt + v2BuyBnb + tipBnb > vault.balance` would trip
    the `pullBnbForLaunch` `TokenBalanceTooLow` revert OR the router's
    `InsufficientFunding` revert. so the cap on tip is the vault balance.
  - low `minV2TokensOut` → bot sandwiches itself with garbage slippage,
    losing tokens to an MEV bot in the same block. mitigation: bundle is
    submitted via 48 Club Puissant private mempool, not public. an
    attacker who controls the bot key can still set bad slippage, but
    they can't be sandwiched by a third party in the private flow.
  - early `deadline` → bundle reverts `Expired()`. self-inflicted, not
    a steal vector.
  net: a compromised bot key can BURN value via tip-to-48Club and via
  slippage but cannot redirect tokens to an attacker-controlled address
  (the splits are hardcoded to DEAD / treasuryLp / vault). worst case
  is full vault BNB drained to `TIP_RECEIVER` (48 Club EOA). accepted
  for wave H. follow-up: clamp `tipBnb <= MAX_TIP_BPS * (quoteAmt + v2BuyBnb)`.
- **reentrancy via malicious token.** the curve token is a fresh flap
  `FlapTaxTokenV3` clone, its bytecode is controlled by flap. but
  `safeTransfer` triggers `transfer` which (for tax tokens) calls
  `taxProcessor.dispatch` callbacks. the router flips `executed = true`
  BEFORE any third-party call, so reentry through transfer hooks lands on
  `AlreadyExecuted`. CEI verified in test
  "reverts when router.executeBundle called twice (one-shot guard)".
- **predicted-token mismatch.** the router asserts
  `token == predictedToken` after the portal call. if portal returns a
  different address (salt collision, portal bug, malicious portal
  upgrade), router reverts `PredictedAddressMismatch` and rolls back.
- **pair-not-created path.** for tier 80 (`v2BuyBnb == 0`), router skips
  the pair check entirely. for graduating tiers, router checks
  `PCS_FACTORY.getPair(token, WBNB) != address(0)`. if portal failed to
  graduate when expected, router reverts. this guards against partial
  graduation states.
- **dust sweep soft-fail.** the BNB-dust sweep to `0x...dEaD` at the
  end of `executeBundle` is intentionally soft-fail (`ok; // silence`).
  a malicious DEAD address could revert (it can't, `0x...dEaD` is a
  valueless EOA on BSC). this is just hygiene; if we got this far, we
  do not want a sweep failure to unwind a successful bundle. accepted.
- **portal grief via auto-graduation surprise.** if portal's graduation
  threshold drifts (say flap upgrades to require 25 BNB), our tier 80
  config sending 16 BNB still doesn't graduate (matches assumption).
  our tier 90+ config sending 20 BNB may stop graduating, causing
  `getPair == address(0)` and `PairNotCreated` revert. accepted, bundle
  fails atomically, vault keeps BNB, bot triggers refund. monitoring
  in `EMPIRICAL_VALIDATION.md` section 6.
- **commissionReceiver / commissionBps governance drift.** flap portal
  reads commission bps from its own state, not from our params. if flap
  changes the commission formula post-launch, the tax stream split
  changes too. our token contract doesn't care. accepted as third-party
  protocol risk.

### 3.4 invariants

- **one-shot:** `executed == true` post-call. any second call reverts.
- **CEI:** `executed = true` is set BEFORE any third-party call.
- **BNB sourcing:** all router BNB is pulled from vault inside the same
  tx. no pre-existing router BNB is required.
- **no persistent custody:** post-bundle, `address(this).balance == 0`
  modulo dust swept to DEAD; `IERC20(token).balanceOf(this) == 0`
  modulo rounding crumbs included in the vault share. (the comment in
  the contract says rounding crumbs go to the vault share; verified
  in tests via `vaultAmt = totalY - burnAmt - treasuryAmt`.)

### 3.5 known limitations / accepted risks

- the dust sweep to DEAD destroys leftover BNB. for tier 80 with no v2
  buy and a 0.01 BNB pre-deposit accidentally sent to router, that BNB
  would be burned. mitigation: don't send raw BNB to a per-launch
  router pre-bundle. acceptable since per-launch routers are deployed
  fresh and address-disclosed only at createLaunch time.
- no recovery path for stuck tokens or BNB in a per-launch router after
  a successful bundle. since the router has no `sweep` function and
  no `owner`, anything stuck (eg ERC-20 someone airdrops post-bundle)
  is permanently locked. accepted, per-launch routers are not
  expected to receive any third-party value.
- **NO formal verification.** the wave H tests cover happy paths,
  reverts, and one-shot guards but do not run a model-checker
  (foundry's `forge-std` invariant tests, certora, or halmos) over the
  vault state machine. recommendation for a follow-up wave.

## 4. TreasuryLP

per-launch custody for the 10% bundle slice. owner-sweepable.

### 4.1 roles

| role | bound to | what they can do |
|------|----------|------------------|
| owner | `treasuryLp.owner` immutable (creator at createLaunch time) | `sweep` any token to any address |
| factory | `treasuryLp.factory` immutable | nothing on-chain (informational) |
| anyone | n/a | `recordManagedToken`, `balance`, raw BNB reverts |

### 4.2 trust assumptions

- the owner is the launch creator at construction time. they can drain the
  10% token allocation at will. **this is BY DESIGN for wave H.** the
  intended follow-up wave promotes this contract to a real V3 single-sided
  LP deployer where `sweep` becomes restricted to a V3-deployer-only path.
  for wave H we ship custodial.

### 4.3 attack surfaces

- **owner unilateral drain.** creator can call `sweep(creatorAddr, token, balance)`
  and walk away with the 10% allocation. **accepted with public
  disclosure**, wave H positions treasury-LP-promised users as
  trusting-the-creator. ui copy should make this explicit.
- **front-running record managed token.** `recordManagedToken` is
  permissionless. the bundle router itself does not call it (it just
  `safeTransfer`s to treasury). if a third party calls `recordManagedToken`
  with the wrong address first, subsequent calls with the legitimate token
  revert `MultipleTokens`. but the legitimate token's `safeTransfer` still
  succeeds, so the tokens land in treasury anyway. impact: `balance()`
  returns 0 for the legit token (because `managedToken` points to the
  wrong addr). owner's `sweep(to, t, amount)` still works because it
  takes the token addr as a parameter. so the worst case is the `balance()`
  view returning stale data; no value at risk. accepted.
- **dust attacks via spam ERC-20s.** anyone can airdrop tokens to the
  treasuryLp contract. since `managedToken` locks to the first registered
  token, spam tokens just sit there. owner sweep handles them via the
  token-addr parameter. accepted.
- **raw BNB rejection.** `receive()` reverts `NoBnbAccepted`. cannot
  accidentally accumulate BNB.

### 4.4 invariants

- `owner` and `factory` are immutable.
- `managedToken` is monotonic: set once from address(0), then locked.

### 4.5 known limitations / accepted risks

- **single point of failure on owner key.** wave H treasury custody
  collapses to "trust the creator's key." not better than the creator
  holding the 10% tokens themselves. the user-facing value of
  `TreasuryLP` for wave H is purely the **commitment surface**: the
  10% slice is in a contract whose only mutating function is `sweep`,
  making creator behavior auditable on-chain. follow-up wave moves
  this to a real V3 single-sided LP deployer where the tokens become
  actual LP positions and the owner cannot rug.

## 5. cross-cutting concerns

### 5.1 MEV / front-running

- launch bundles go through 48 Club Puissant private mempool
  (`https://puissant-bsc.48.club`). tip is paid in the same tx via
  `payable(TIP_RECEIVER).call{value: tipBnb}("")` at end of
  `executeBundle`. see `PUISSANT_TIP_RESEARCH.md` for documented tip
  mechanics; we use 0.03 BNB default with escalation to 0.10 BNB max
  across 3 retries.
- portal's `newTokenV6` includes `salt`, so a generalized front-runner
  who copies the calldata gets a `RateLimitExceeded` from portal
  (their `tx.origin` would already be in cooldown) OR a salt-collision
  revert. no portable front-run vector found in empirical probing.
- the V2 follow-up buy uses `swapExactETHForTokensSupportingFeeOnTransferTokens`
  with `minV2TokensOut` slippage guard. slippage is bot-supplied; default
  5% off the pre-tax expected amount.
- there is NO public mempool fallback if Puissant fails. after 3 retries,
  the bot enables refund.

### 5.2 oracle dependence

- no on-chain oracle is used. `openMcBnb` in `BundleExecuted` reads PCS
  V2 reserves directly, which is event-emission only (informational for
  the indexer). no contract logic branches on it.

### 5.3 cross-launch interactions

- launches are isolated. `LaunchFactory.usedSalts` is the only shared
  mutable state. salt reuse reverts cleanly.
- the same `bundleBot` EOA can be assigned to multiple launches (typical:
  4-EOA pool round-robins across many launches). this is a **shared trust
  surface**: a single bot key compromise affects every launch using that
  bot. mitigation: 4-EOA pool means a single compromised key affects
  ~25% of launches. follow-up wave: per-launch ephemeral bot keys.
- no cross-launch token sharing, no cross-launch BNB pooling.

### 5.4 admin abuse

- factory owner can call `adminEnableRefund` on any vault not in LAUNCHED
  state. this is a global kill switch. owner CANNOT change vault math,
  CANNOT redirect refund destinations, CANNOT take tokens. worst case:
  owner trolls by flipping live OPEN launches to REFUND. depositors get
  their BNB back; loss is only opportunity cost.
- factory owner CANNOT modify any per-launch `BundleRouter`,
  `TreasuryLP`, or post-LAUNCHED vault state. once a launch graduates,
  the owner has no further authority over it.
- no `pause()` or contract-wide kill switch.

### 5.5 reentrancy enumeration

| function | guard | third-party call source | safety analysis |
|----------|-------|----------------------|------------------|
| `LaunchVault.deposit` | nonReentrant | none (just `+= msg.value`) | safe |
| `LaunchVault.withdraw[All]` | nonReentrant | `payable(msg.sender).call{value: refundAmount}` | state cleared before call; CEI ok |
| `LaunchVault.refund` | nonReentrant | `payable(msg.sender).call{value: refundAmount}` | state cleared before call; CEI ok |
| `LaunchVault.claim` | nonReentrant | `IERC20(token).safeTransfer` (flap tax token, no recipient hook) | safe |
| `LaunchVault.pullBnbForLaunch` | router-gated + state guard | `payable(router).call{value: amount}` | state to LAUNCHED before call; CEI ok |
| `LaunchVault.distribute` | router-gated + `distributed` one-shot | none | safe |
| `BundleRouter.executeBundle` | `executed` one-shot CEI | many | one-shot flag set first; safe |
| `TreasuryLP.sweep` | owner-gated | `IERC20.safeTransfer` | no state change; benign |

## 6. accepted risks summary

honest list of "we know, we ship anyway, for these reasons":

1. **single bundle bot key per launch.** compromise = up to vault-balance
   loss via tip griefing. mitigation = 4-wallet pool, KMS custody,
   continuous monitoring. follow-up = per-launch ephemeral keys.
2. **factory owner is EOA in initial deployment.** kill switch is global.
   migrate to multisig before mainnet steady-state. cosmetic / non-blocking
   for first launches.
3. **TreasuryLP is custodial for wave H.** creator can drain. follow-up wave
   = V3 CLAMM single-sided position deployer.
4. **no formal verification.** test suite is property-style but
   no model-checker. follow-up = certora rules over state machine.
5. **no public mempool fallback.** if Puissant goes down during a launch
   window, we refund instead of degrading to public submission. accepted
   to avoid sandwich risk.
6. **portal upgrade risk.** flap can upgrade portal v5.14.1 to a new
   version that breaks our assumed `newTokenV6` semantics. we have no
   on-chain protection against this. monitoring + circuit-breaker via
   `adminEnableRefund` is the operational response.
7. **vesting parameters hardcoded.** 50% TGE + 50% linear over 24h is
   not configurable per launch in wave H. accepted; tunable in a follow-up.
8. **rate-limit-throughput cap.** portal enforces 90s cooldown per
   `tx.origin`. 4-EOA pool gives 160 launches/hour ceiling. acceptable
   for initial steady-state; scaling = adding EOAs to the pool.
