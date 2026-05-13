# empirical validation, wave H

what we measured on a real BSC fork before claiming the spec is correct.

probe artifacts live in `waifu.fun-wt/{rate-limit-probe,wave-h-v7-probe}/probe/`
in the workspace; this doc summarizes findings. all probes ran against an
anvil/ganache fork pinned at BSC block 97_368_808, real flap portal at
`0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`.

## 1. portal version + addresses

| name | address | source |
|------|---------|--------|
| flap portal | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` | portal.version() = `v5.14.1` |
| TOKEN_TAXED_V3 impl (CREATE2 base) | `0x024f18294970B5c76c0691b87f138A0317156422` | EIP-1167 minimal-proxy delegate of `newTokenV6`-launched tokens |
| flap global feeReceiver | `0x8a08D98CBB218fceB318Ecf3aBc1BA43D8A7aB0E` | portal-set, readable via `splitter.feeReceiver()` |
| PCS V2 factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` | PCS docs |
| PCS V2 router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` | PCS docs |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | BSC |
| 48 Club builder EOA | `0x4848489f0b2BEdd788c696e2D79b6b69D7484848` | 48 Club docs |

clarification (round 3 of spec verification, 2026-05-13): tokens launched via
`newTokenV2` clone from a different impl than tokens launched via `newTokenV6`.
all wave H launches use `newTokenV6` exclusively. the impl above is the
authoritative CREATE2 base for our launches.

## 2. portal `newTokenV6` characterization

full param struct (26 fields) verified against on-chain behavior. fields that
revert on bad values:

- `dexThresh`: only `FOUR_FIFTHS (1)` accepted for `tokenVersion = TOKEN_TAXED_V3`.
  other enum values revert `InvalidDexThresholdType`. flap docs example
  (`TWO_THIRDS`) is wrong in practice.
- `migratorType`: only `V2_MIGRATOR (1)` accepted for tax tokens.
- `antiFarmerDuration`: minimum 86400 seconds (1 day). shorter reverts
  `AntiFarmerDurationTooShort()` (selector `0x34fe4bd5`). brief said 1 hour;
  spec corrected to 1 day default.
- bps fields: `mktBps + deflationBps + dividendBps + lpBps` MUST sum to 10000.
  wave H uses `mktBps = 10000` and the other three = 0.
- `tokenVersion`: must be `TOKEN_TAXED_V3 (6)` for `commissionReceiver` to flow.
- `quoteToken`: `address(0)` accepted for native BNB.
- `permitData`: empty bytes for native quote.
- `extensionID`: `bytes32(0)`, no extension hook for wave H.

### `beneficiary` semantics changed in V6 vs V2

V2: `beneficiary != msg.sender` silently reverts when called from a contract.

V6: call succeeds regardless of `beneficiary`, but **the dev-buy tokens still go
to `msg.sender`** (which is `address(this)` when called from a contract). the
`beneficiary` field on V6 is a downstream marketing/airdrop tag, NOT the
dev-buy recipient.

operational consequence: wave H `BundleRouter` passes `beneficiary = address(this)`
as the safe default. router receives all curve tokens. matches the V2 architectural
assumption.

## 3. graduation threshold, corrected

prior spec: "flap's curve graduates at exactly 16 BNB regardless of tier."

actual behavior verified by `v6-v7-characterization.cjs` EXP 5:

| quoteAmt | status post-call | progress | V2 pair |
|---------:|:-----------------|---------:|:--------|
| 16 BNB | `Tradable (1)` | `0.960` | none |
| 20 BNB | `DEX (4)` (graduated) | `1.0` | created + funded |

the actual graduation threshold sits between 16 and 20 BNB. at 20+ BNB it is
reliable. wave H tier configs were corrected:

```
TIER_80: (presaleCap, quoteAmt, v2BuyBnb) = (16, 16,   0)  curve-only, no graduation
TIER_90: (presaleCap, quoteAmt, v2BuyBnb) = (32, 20,  12)  graduates inside portal
TIER_95: (presaleCap, quoteAmt, v2BuyBnb) = (64, 20,  44)  graduates inside portal
TIER_98: (presaleCap, quoteAmt, v2BuyBnb) = (160,20, 140)  graduates inside portal
```

this correction was caught in PR #528 real-fork test (see section 7 below).

## 4. cooldown / rate-limit characterization

selector `0xa7382e9b = RateLimitExceeded(address user, uint256 unlockTime)`.

### dimension keyed: tx.origin (NOT msg.sender)

probe `cooldown.cjs`:

- signer A calls `wrapperX.callV2` → ok (gas 1.25M).
- same signer A calls `wrapperY.callV2` (different wrapper, virgin contract)
  → reverts with `user = signerA`. wrapper has no role; portal sees the EOA.
- signer B (fresh) calls the same `wrapperX` mid-cooldown → succeeds. wrapper
  has no per-contract cooldown.

operational consequence: deploying a fresh `BundleRouter` per launch does NOT
reset the cooldown. wallet rotation is the only mitigation.

### duration: ~90 seconds

binary search via `evm_increaseTime`:

```
wait=86s → reverted (elapsed 88s)
wait=88s → succeeded (elapsed 93s)
```

cooldown lives in `[89, 93]`s. planning value = **90 seconds**.

`unlockTime` field is an absolute unix timestamp in seconds, always
`createTimestamp + 90`.

### throughput

per signing wallet: 1 launch / 90s = 40 launches / hour.

wave H ships with a **4-wallet bundle bot pool**, giving 160 launches/hour
ceiling with margin for retries. selection: `MIN(next_available_ts) ≤ now()`.

## 5. commissionReceiver flow

probe `v6-followup.cjs` EXP 4r + EXP 6r:

- launch token with `commissionReceiver = 0xC0C0...C0c0` (custom).
- `FlapTaxTokenV3(token).taxSplitter().commissionReceiver()` returns the
  exact custom address (note: accessor is `taxSplitter()` not `taxProcessor()`
 , corrected in backend PR #520).
- `commissionBps()` returns 60 for our 10% tax rate (6% of post-fee tax).
- after a 0.5 BNB buy + 0.25 BNB sell + `splitter.dispatch()`:
  - custom `commissionReceiver` BNB delta: **+0.01076 BNB**
  - flap global `feeReceiver` BNB delta: +0.05546 BNB
  - `commissionQuoteBalance()` after dispatch: 0

ratio: commission / (commission + protocolFee) ≈ 16.2%. matches flap's
documented commission split.

operational consequence: wave H MUST pass non-zero `commissionReceiver` on
every `newTokenV6` call. without it, all commission flows to flap global and
our platform earns 0 from transfer tax.

## 6. atomic-revert property

probe `flap-bundle-probe-standalone.js` + the wave-h-bundle-flow test
"bundle revert leaves vault BNB intact":

- mock router subcontract injects a revert after portal returns successfully.
- entire tx reverts. vault BNB intact. no token on chain (EVM rollback).

this is the foundation of the atomic-or-bust property. any step in
`executeBundle` reverting unwinds portal-created state, V2 swaps, token
transfers, tip transfers, and the `pullBnbForLaunch` BNB pull.

## 7. real-fork pre-audit validation, PR #528

before declaring wave H ready for audit, we ran the actual
`executeBundle` against the real flap portal on a forked mainnet. caught
**four critical bugs** in the previously-merged code:

| # | bug | severity | fix |
|---|-----|----------|-----|
| 1 | wrong `TOKEN_TAXED_V3` impl address (had been "verified" against `newTokenV2`-cloned tokens, which use a different impl) | P0, every CREATE2 prediction would have mismatched the deployed addr | switched to `0x024f...6422`, the actual V3 impl |
| 2 | spec assumed 16 BNB graduates portal; empirically 16 BNB stops at progress=0.96 with no V2 pair | P0, tier 80+ would have failed `PairNotCreated` | tier configs corrected to use 20 BNB quoteAmt for graduating tiers |
| 3 | router had a hardcoded `PairNotCreated` check that broke tier 80 (curve-only) launches | P1, tier 80 always reverts | router skips pair check when `v2BuyBnb == 0` |
| 4 | tier 80 was advertised as having a V2 pair; corrected to "curve-only, organic graduation later" | P1, UX disclosure / accounting | spec + tier math updated |

these were caught by the live real-fork test, NOT by the regular hardhat
test suite (which used mocked portal). the lesson: mocked-portal tests are
insufficient for an integration this tight with an third-party contract.

real-fork test path: `test/integration/wave-h-real-fork.test.js`. gated on
`FORK_BSC=true` env so it does not run in CI (would require fork access on
every run; portal cooldown also means test re-runs need fresh signers).

## 8. gas baselines (real-fork, tier 80, single launch)

from PR #528 measurements:

| operation | gas |
|----------|----:|
| `LaunchFactory.createLaunch` | ~3.32M |
| `BundleRouter.executeBundle` (tier 80, curve only) | ~1.99M |
| `LaunchVault.claim` (single depositor) | ~172k |

extrapolated for graduating tiers (curve + graduation + V2 follow-up buy):

| operation | estimated gas |
|----------|--------------:|
| `executeBundle` (tier 90/95/98, with V2 follow-up) | ~5.0-5.5M |

bundle-bot gas limit recommendation: 6M for tier 80, 8-10M for graduating tiers.
20M outer-tx ceiling has headroom for slow PCS state.

V6 baseline from probe (`quoteAmt = 20 BNB`): ~5.27M gas inside `newTokenV6`
alone. add ~500k for our bundle overhead.

## 9. validation log

| date | activity | finding | docs updated |
|------|----------|---------|--------------|
| 2026-05-11 | flap bundle probe (option A viability) | atomic bundle from contract caller works when `beneficiary == address(this)` | `FLAP_BUNDLE_PROBE_FINDINGS.md` |
| 2026-05-12 | TOKEN_TAXED_V3 impl verification (round 1) | recorded wrong impl; would have re-verified later | spec section 4.1 (incorrect at time) |
| 2026-05-12 23:55 | impl verification (round 2) | re-verified, still wrong (looking at V2-clone tokens, not V6-clone tokens) | spec verification log round 2 |
| 2026-05-13 | cooldown probe complete | tx.origin keyed, 90s duration | spec section 8 |
| 2026-05-13 | V6/V7 characterization | V7 does not exist; V6 commissionReceiver works; beneficiary semantics softened | spec sections 1, 5; `FLAP_BUNDLE_PROBE_FINDINGS.md` |
| 2026-05-13 | real-fork executeBundle (PR #528) | **4 P0/P1 bugs caught**; tier math corrected; impl address corrected | spec verification log round 3, this doc |

## 10. things NOT verified (acknowledged gaps)

documented because honesty > marketing:

- V6 from a contract caller using the real `BundleRouter` was inferred from
  V2 contract behavior + V6 EOA behavior. the wave H real-fork test in
  `test/integration/wave-h-real-fork.test.js` exercises this path, but only
  the tier 80 path was confirmed live before commit. tier 90+ executeBundle
  real-fork test exists in code but rate-limit cooldowns and fork-block
  staleness mean it was not run continuously.
- splits other than `(mktBps=10000, deflationBps=0, dividendBps=0, lpBps=0)`.
  if a future wave changes the distribution split, re-probe is needed.
- the V6 internal-call-counts-as-priority assumption for 48 Club Puissant
  tip-via-call has medium confidence (docs say "BNB sent to builder control
  EOA"; on-chain samples are direct EOA transfers). if the priority math
  excludes internal calls, we may need to migrate to `eth_sendBundle` with
  a second tip transfer tx. operational risk; flagged in `PUISSANT_TIP_RESEARCH.md`.
- portal upgrade behavior. we have no on-chain protection if flap migrates
  to a portal v6.x with different semantics. operational monitoring +
  `adminEnableRefund` is the response.

## 11. probe scripts inventory

| script | purpose | key result |
|--------|---------|-----------|
| `flap-bundle-probe/probe-minimal.js` | option A wrapper viability | wrapper works when `beneficiary == self` |
| `flap-bundle-probe/probe-beneficiary.js` | V2 beneficiary != msg.sender | reverts silently from contract |
| `rate-limit-probe/probe/cooldown.cjs` | dimension keyed by portal | `tx.origin`, not `msg.sender` |
| `rate-limit-probe/probe/cooldown-binsearch.cjs` | cooldown duration | ~90s |
| `rate-limit-probe/probe/tax-stream-4.cjs` | commission flow V2 path | V2 has no `commissionReceiver`; need V6 |
| `wave-h-v7-probe/probe/v6-v7-characterization.cjs` | V7 existence + V6 graduation | V7 does not exist; 20 BNB graduates |
| `wave-h-v7-probe/probe/v6-followup.cjs` | V6 `commissionReceiver` payouts | works as documented |
| `wave-h-v7-probe/probe/v6-cooldown-and-beneficiary.cjs` | V6 cooldown + beneficiary semantics | same 90s; beneficiary now soft |
| `contracts-evm/test/integration/wave-h-real-fork.test.js` | end-to-end real-fork executeBundle | **4 bugs caught pre-audit** |
