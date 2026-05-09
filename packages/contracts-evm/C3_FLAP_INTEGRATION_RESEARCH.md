# C3 Flap Integration Research — 2026-05-09

Audit context: V3 audit finding C-3 — our integration tests in
`packages/contracts-evm/test/integration/full-flow.test.js` exercise BundleRouter's
graduation hook against a hand-rolled `MockFlapToken`, not against a real Flap V3
(`TOKEN_TAXED_V3`) bonding-curve token deployed through the Flap Portal on BSC.
The mock and the real protocol diverge in three places that matter for the audit:
the entry-point ABI, the graduation state machine, and the LP destination DEX.

This document is **research only** — no contracts or tests were authored.
Implementation is W42b's job.

Workdir: `~/projects/waifu.fun-wt/c3-flap-research` (branch
`sol/wave-c3-flap-research` off `origin/develop`, post `b5cff3f0`).

---

## 1. Real Flap V3 Contract

### Source location

The Flap protocol is **not vendored** in our monorepo. We ship a TypeScript SDK
(`packages/flap`) that wraps a published Flap Portal ABI. There are no Flap
Solidity sources in `packages/contracts-evm/contracts/`. The closest thing is
the mock at `packages/contracts-evm/contracts/mocks/LaunchRouterMocks.sol`.

Real source of truth:

- Portal v5.8.6 deployed at `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` on
  BSC mainnet (chainId 56). Live portal returns `version()` = `v5.14.1` as of
  block 97_314_620 (2026-05-09), so the value pinned in
  `packages/flap/src/constants.ts` is one minor version stale but the address
  is correct.
- Token implementations on BSC mainnet (from Flap docs,
  `https://docs.flap.sh/flap/developers/deployed-contract-addresses.md`):
  - `TOKEN_TAXED` (V1): `0x29e6383F0ce68507b5A72a53c2B118a118332aA8`
  - `TOKEN_TAXED_V2`: `0xae562c6A05b798499507c6276C6Ed796027807BA`
  - `TOKEN_TAXED_V3`: `0x024f18294970B5c76c0691b87f138A0317156422`
    (bytecode confirmed deployed, ~38.6 KB)
- VaultPortal: `0x90497450f2a706f1951b5bdda52B4E5d16f34C06`
- WBNB / PCS V2 reused from BSC: WBNB
  `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`, PCS V2 factory
  `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73`, PCS V2 router
  `0x10ED43C718714eb63d5aA57B78B54704E256024E`.
- Our SDK ABI (Portal subset) lives in
  `packages/flap/src/abi/portal.ts` and was hand-narrowed; it doesn't include
  `getTokenV8`, `newTokenV6`, or `FlapTokenAsymmetricTaxSet`, which are V3-era
  additions on Portal v5.9.0+.

### Key constants

Flap V3 launches on BSC follow the published bonding curve and use the
following parameters (from `packages/flap/src/constants.ts` plus
`docs.flap.sh/.../list-on-dex.md`):

| Constant | Value | Notes |
|---|---|---|
| Total supply | 1_000_000_000 e18 | Fixed by spec |
| DEX supply threshold (default) | 800_000_000 e18 | `dexThresh = 0` (default) |
| BNB at graduation | 16 ETH (BNB) | Current curve since block 51_314_696 |
| Curve `r` | 6.14 e18 | Virtual ETH reserve |
| Curve `h` | 107_036_752 e18 | Virtual token reserve |
| Curve `k` | 6_797_205_657.28 e18 | Virtual liquidity^2 |
| Protocol fee | 100 bps (1%) | `FLAP_PROTOCOL_FEE_BPS` |
| Allowed buy/sell tax | 0, 100, 300, 500, 1000 bps | V3 supports asymmetric |
| Commission for V3 launchpads | `floor(60000 / taxBps)` (capped at 600) | E.g. 200 bps at 3% tax |

Note: an alternative curve config exists for USD-quoted tokens
(10000 USD1 reserve), but BNB-quoted is what BundleRouter assumes today.

### Graduation state machine

Real graduation flow (from
`docs.flap.sh/.../list-on-dex.md` and event docs):

1. Buyers call `Portal.swapExactInput({inputToken: 0, outputToken: token, ...})`
   with BNB attached. This routes through the Portal, which in turn
   updates the bonding curve state stored on the Portal (not on the token).
2. Each buy emits `TokenBought`, `FlapTokenProgressChanged`, and may emit
   tax/dispatch events.
3. When the token's circulating supply crosses `dexSupplyThresh` (800M by
   default) and the BNB reserve crosses 16 BNB, the Portal:
   a. Marks the token's status as `STAGED` momentarily and then `DEX`.
   b. For tax tokens (V1/V2/V3): always migrates to a Uniswap-V2-style fork.
      On BSC `DEX0 = PancakeSwap`, so a PancakeSwap V2 pair is created.
   c. For non-tax tokens: tries PCS V3 first; falls back to V2.
   d. Emits `LaunchedToDEX(token, pool, amount, eth)`.

The graduation-time event signature
`LaunchedToDEX(address,address,uint256,uint256)` hashes to
`0x6e4f47630b8745b8cacbd44f42a8a33e7eea7cc08ef22fc7630f4f385784ff7d`
(verified). Our indexer in `apps/evm-indexer/src/handlers/launched-to-dex.ts`
already consumes it correctly.

The post-graduation pool address is **not** deterministic from the token
address alone via PCS V2 CREATE2, because Flap uses a `migrator` contract that
holds the LP liquidity (the LP is locked in the migrator, not the token, not
the user). The pair is the canonical CREATE2 pair on the V2 factory, so
`PancakeFactory.getPair(token, WBNB)` returns the right address — confirmed
empirically below.

### Graduation event signature

```
event LaunchedToDEX(
  address token,    // not indexed — flap token address
  address pool,     // not indexed — DEX pool address (V2 pair for tax tokens)
  uint256 amount,   // not indexed — token amount sent to LP (typically 200M for default)
  uint256 eth       // not indexed — quote-token amount sent to LP (16 BNB at graduation)
);
```

All four fields are non-indexed (in `data`), matching what we have today in
`packages/flap/src/abi/portal.ts:258`.

### Tax rate / fee accounting

V3 introduces **asymmetric** tax: `buyTaxRate` and `sellTaxRate` can differ.
At launch time the protocol always emits both `FlapTokenTaxSet(token, max)`
and `FlapTokenAsymmetricTaxSet(token, buy, sell)`. V3 also supports a
`commissionReceiver` (optional, integrator-only) that earns a permanent
share of the post-protocol-fee tax remainder, and the rate is
**protocol-computed**, not user-set, by `commissionBps = floor(60000 / effTax)`
capped at 600 bps for taxes ≤ 1%.

V3 has a **dynamic liquidation threshold** (bidirectional) for the
auto-swap-tax mechanism — the contract automatically converts accumulated
tax tokens into BNB on PCS V2 and dispatches them. This matters for fork
tests because the migrator/processor will call into PCS V2, which is what
makes the BSC fork mandatory.

---

## 2. Mock vs Real Comparison Matrix

| Concern | MockFlapToken | TOKEN_TAXED_V3 | Risk if mismatched |
|---|---|---|---|
| Buy entry point | `flap.buy()` payable on the token itself | `Portal.swapExactInput({inputToken:0, outputToken:token, ...})` payable on the **portal** | **HIGH.** BundleRouter's `IFlapToken(params.flapToken).buy{}()` call **will revert** against any real flap token. Real router must call the Portal, not the token. |
| Bonding curve math | Linear, simplified (`tokensOut = msg.value * 800M / 16 BNB`) | Constant-product variant: see `r`, `h`, `k` curve params | **MEDIUM.** Tokens out per BNB are wrong on the mock by ~5-15% near graduation. We have no quote check today, but slippage protections in BundleRouter's V2 leg use `minTokensFromV2` not curve output. |
| Graduation trigger | Self-triggered in `_graduate()` at threshold from inside `buy()` | Triggered inside the Portal's tax/swap logic when supply OR reserve crosses threshold | **LOW.** Both end with a V2 pair existing; BundleRouter only checks `factory.getPair(token, WBNB) != address(0)`, which works either way. |
| LP destination | PCS V2 only | PCS V2 (tax tokens) or PCS V3 (non-tax, with V2 fallback) | **LOW for tax tokens** (we always use tax tokens, `migratorType=V2_MIGRATOR`), but if anyone ever passes a non-tax flap into BundleRouter, the V3 path would not match the V2 pair lookup. Worth a guard. |
| Tax exemption | Mock auto-exempts router and per-buyer transient | Real V3 has fine-grained `taxExempt(address)` set by `taxProcessor`, plus pre-bond and anti-farmer modes (`antiFarmerDuration`, `taxDuration`) | **MEDIUM.** Real flap may apply tax to BundleRouter's V2 buy — tokens received < expected. Our `tokensToTax = (received * 100/97) - received` formula assumes flat 3% tax; V3 with asymmetric or non-3% tax breaks the open-MC math but does not break execution. |
| Tax destination | Mock: tokens sit on the token contract | Real: token sells the tax via `taxProcessor.dispatch()` into BNB at threshold; goes to commission + marketing + dividends + LP add | **LOW for execution**, but emitted `BundleExecuted.tokensToTax` will be off. |
| Permit data | None | Optional `permitData` in `swapExactInput` | **NONE for buys with native BNB.** Permit is only relevant for sells. |
| LP token holder | `address(this)` (mock holds LP forever) | A migrator contract holds (locked) LP | **LOW for our tests** — we don't read LP in BundleRouter. |
| Initial buy support | Mock has none | `swapExactInput` is the same as a normal buy | **N/A.** `newTokenV5/V6` accepts an optional initial `quoteAmt` for the creator, but BundleRouter expects to fill the whole curve in one tx. |
| `.totalSupply()` | Constant 1B at all times | Constant 1B at all times | Both work for `openMcBnb` math. |
| `IERC20.transfer/balanceOf` | Standard ERC20 | Standard ERC20 + tax interception | Both work, but FOT-aware paths are mandatory (we already use `swapExactETHForTokensSupportingFeeOnTransferTokens`). |

**Punchline:** the most consequential mismatch is the **buy entry point**.
BundleRouter today assumes `flapToken.buy()` exists; on a real flap, the buy
must go through the Portal with a different payload. This is exactly what the
audit C-3 finding says, and it means BundleRouter cannot graduate a real flap
token without code changes.

---

## 3. Candidate Real Flap Addresses on BSC

Discovery method: scanned `FlapTokenAsymmetricTaxSet`
(`0x46cc246a238d1ca0951a15200994903e2d56cbb0389e63f09d66412a787aa3c0`,
V3-only event) on the Portal and called `getTokenV8(token)` to confirm
`tokenVersion == TOKEN_TAXED_V3 (6)`. Cross-validated graduated pools via
PancakeFactory.getPair on BSC mainnet.

### Post-graduation candidates (for read-only state assertions and "negative" tests)

All confirmed `tokenVersion = TOKEN_TAXED_V3 (6)`, status `DEX (4)`,
graduated to PCS V2 (`dexId = 0`):

| Token | Address | V2 Pair | Buy/Sell tax (bps) |
|---|---|---|---|
| PTCG | `0x262F39B6ED3Af1F7A161c34fBbcAA66bfBC87777` | `0xC3A3563F7236B04580D1200F409eE0834683bE49` | 300 / 400 |
| RHC | `0x8Ea350C0A5cd5247647B312515FE21e0fe597777` | `0xB58949350B63A1085cAfDF7bC61ABA3D93ad78f3` | 100 / 300 |
| XCHAT | `0xbb8041A8D875234C952BD92B102F8861565e7777` | `0xB0b79835FDD284517C080187a2EfD153279D975F` | 400 / 400 |
| BANK | `0x46dDcc662A045770CE1e264819542C9617547777` | `0xa5843E74902E5448B4BF720826b03fd15e53E7a5` | 400 / 400 |
| 龙头 | `0xF786A61aFDab4769997F10576f8a2f63c7297777` | `0xc91F5364E9425C5CFe58CB05aF7Dd7CDca2f69eB` | 400 / 400 |
| 苍生 | `0x8C5f51a348F6a3fb7EE150b1579f6A4e54B47777` | `0x2910a50E7a1f1fC0777913903541Edd94d2E0B84` | 300 / 300 |

Sanity check: `PancakeFactory.getPair(PTCG, WBNB)` returns the same address
as the Portal's `pool` field (`0xC3A3...3bE49`). Confirmed for PTCG and XCHAT;
RHC's pair was returned as `0x0` from the factory for one RPC roundtrip,
likely RPC eventual-consistency (same RPC returned a non-zero pair on retry).
**Recommend PTCG** as the primary post-graduation fixture: 3% buy / 4% sell
makes it easy to detect that the test sees asymmetric tax (vs the mock's
flat 3%).

Recommended fork block for post-graduation tests: any block ≥ the graduation
block. Use the **latest finalized block** at test time, since post-grad state
is immutable for this purpose. If reproducibility matters, pick a fixed block
that's at least 1000 past graduation. PTCG was minted around block
97_300_000 (May 2026 timeframe).

### Pre-graduation candidates (for live-graduation tests via Portal)

Sampled from the same `FlapTokenAsymmetricTaxSet` scan, all live with
`status = TRADABLE`:

| Token | Address | Created blk | Reserve (BNB) | Progress | Buy/Sell tax |
|---|---|---|---|---|---|
| Test-1 | `0x1f4d04b456b96893d8fe0467d07dc5d7ebfa7777` | 97_312_466 | 0.6363 | 3.98% | 300/300 |
| Test-2 | `0x3b3db8c2477496e5d3d93e6f352b114dddb67777` | 97_311_000 | 0.2902 | 1.81% | 300/300 |
| Test-3 | `0xfc39c924c8c18af7bdcbe461f11826da5c0d7777` | 97_312_017 | 0.0089 | 0.06% | 300/300 |
| Test-4 | `0x60b75c62573cb27dc433a068588096e4daf47777` | 97_313_593 | 0.0053 | 0.03% | 500/500 |
| Test-5 | `0x2acb4b4317b28f7499b185e8ddff443e6fe17777` | 97_314_491 | 0.0004 | 0.00% | 100/100 |

**Caveat:** these are degen meme-coin launches with very low BNB committed.
Any of them could either graduate organically or get killed (status `KILLED`)
between now and when we run a fork test. They're _probably_ stable for a
deterministic fork test if we pin the block exactly, since the chain is
immutable from a fork's perspective.

Recommended pre-graduation fixture: **Test-1 (`0x1f4d...7777`)**.
- 3%/3% symmetric tax (matches BundleRouter's `tokensToTax` formula)
- Already has 0.6 BNB committed and 4% progress, so we can predictably push
  it past 16 BNB with a 16 BNB curve fill plus a 16 BNB V2 buy
- Recommended fork block: `97_312_500` (a few blocks after creation), or
  the head at the time of test write. Any block where it is still TRADABLE
  works. Use the same FORK_BSC_BLOCK conventions as today's fork tests.

If Test-1 graduates before W42b lands, sample again with the same
`FlapTokenAsymmetricTaxSet` scan in `find-v3-graduated.mjs` (research artifact
in `/tmp/`).

---

## 4. BundleRouter expectations vs real Flap

**Calls BundleRouter makes into `params.flapToken`:**

```solidity
// Step 1
IFlapToken(params.flapToken).buy{value: params.curveFillBnb}();

// Step 2 (read)
IPancakeFactory(pcsFactory).getPair(params.flapToken, WBNB);

// Step 3 (read)
IERC20(params.flapToken).balanceOf(address(this));

// Step 3 (write — V2 buy through PCS router, FOT-safe)
IPancakeRouter(pcsRouter).swapExactETHForTokensSupportingFeeOnTransferTokens(
    minOut, [WBNB, params.flapToken], to, deadline
);

// Step 4 (write — burn)
IERC20(params.flapToken).transfer(DEAD, tokensReceived);

// Step 5 (read)
IPancakePair(pair).getReserves();
IPancakePair(pair).token0();
IERC20(params.flapToken).totalSupply();
```

**Mismatches against `TOKEN_TAXED_V3`:**

1. **`IFlapToken(token).buy()` does not exist.**
   The real flap token implements ERC-20 + the tax processor surface, not
   `buy()`. To buy from the curve, the caller must invoke the Portal at
   `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`:
   ```solidity
   Portal.swapExactInput{value: curveFillBnb}(ExactInputParams({
     inputToken: address(0),         // BNB
     outputToken: params.flapToken,
     inputAmount: curveFillBnb,
     minOutputAmount: minTokensFromCurve,
     permitData: ""
   }));
   ```
   `swapExactInput` returns `outputAmount` (uint256) — useful for accounting.

2. **Step 2 (V2 pair lookup) works as-is** for tax tokens (PCS V2 fork
   migration). Confirmed empirically against PTCG/XCHAT.

3. **Step 3 (V2 buy through PCS router) works as-is.** Real flap V3 tax
   tokens on a PCS V2 pair behave as standard FOT ERC-20s. Tax is taken on
   the buy transfer (taxes the BundleRouter, since `taxExempt[router]` is
   not set in the real protocol unless explicitly configured).

4. **`tokensToTax = (received * 100/97) - received` is wrong** for any
   token whose buy tax is not 3%. We saw 100, 300, 400, 500 bps in the
   live sample. The fix is to read `IFlapTaxTokenV3(token).buyTaxRate()`
   on-chain and compute `received * BPS / (10_000 - BPS)`.

5. **Burn step has no semantic risk** — sending tokens to DEAD is always
   safe with V3 tax on top.

6. **`previewPairAddress` (CREATE2)** assumes the canonical PCS V2
   init-code-hash. PCS uses the standard Uniswap V2 init-code-hash; we
   already have `0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5`
   wired in. This is correct on BSC. No change needed.

**The minimum BundleRouter delta to integrate with real flap V3:**
- Replace `IFlapToken(params.flapToken).buy{}()` with a Portal call.
- Add a constructor / config parameter for the Portal address.
- Optionally add an on-chain tax-bps read for the open-MC math, or remove
  the `tokensToTax` field from the event entirely.

Doing this means BundleRouter becomes a generalized "fill curve, buy on V2,
burn" wrapper rather than a flap-token-specific contract. Worth flagging in
W42b implementation notes.

---

## 5. Test Scenarios Enabled

- [ ] **Pre-graduation: read state.** Read `getTokenV8(Test-1)` from the
      Portal in a fork pinned to a TRADABLE block. Assert `tokenVersion == 6`,
      `status == 1`, `pool == address(0)`, `progress < 1e18`. **Pure
      sanity, no BundleRouter changes needed.** This is the cheapest test
      we can write today and proves our SDK ABI is in shape.

- [ ] **Pre-graduation: graduate via raw Portal.swapExactInput.** Same fork,
      send 16+ BNB through `Portal.swapExactInput` (not BundleRouter)
      until graduation triggers. Assert `LaunchedToDEX` was emitted, status
      flips to `DEX`, `factory.getPair(token, WBNB) != 0`. **Useful as a
      precursor to BundleRouter changes** — proves the test infrastructure
      can drive the real protocol.

- [ ] **Pre-graduation: BundleRouter.execute() + graduation
      (after refactor).** Once BundleRouter is updated to call the Portal,
      execute against Test-1 with `curveFillBnb = 16 BNB` (or whatever
      remaining-to-graduate is at the pinned block) and `v2BuyBnb = 4 BNB`.
      Assert: `LaunchedToDEX` emitted, V2 pair created, BundleRouter sees
      tokens from V2 buy, tokens forwarded to DEAD, dust swept.

- [ ] **Post-graduation: negative test.** Fork at a post-graduation block
      with PTCG. Calling `BundleRouter.execute()` against PTCG should
      revert (curve has no buys to make). Useful to confirm we error
      gracefully when called on an already-graduated token.

- [ ] **Asymmetric tax accounting.** Use PTCG (300 buy / 400 sell). Buy
      from the V2 pair via BundleRouter and assert that the tokens-burned
      math handles a non-3% buy tax (this exposes the
      `tokensToTax = received*100/97 - received` bug from C-3 directly).

- [ ] **Tier-90 e2e on real flap.** Replace `MockFlapToken` in the
      Tier-90 happy-path test with a fixture that calls into a fresh
      Portal-launched flap token at fork time. Run the full vault deposit
      + close + launch + claim flow with vesting, against a real PCS V2
      pair. This is the highest-value test and the closest analog to
      production.

Edge cases worth covering once the basics work:
- 100 bps (1%) tax (different commission math, lowest tax bucket)
- 1000 bps (10%) tax (highest tax bucket; commission becomes minimal)
- Custom dexThresh (some flap launches override the default)
- Portal upgrade between fork block and test block: ensure ABI still
  resolves (current Portal v5.14.1 vs SDK-pinned v5.8.6)

---

## 6. Recommended Path

**For the next implementation wave (W42b):**

- **Specific token to use (post-graduation fixture):** PTCG
  `0x262F39B6ED3Af1F7A161c34fBbcAA66bfBC87777` with V2 pair
  `0xC3A3563F7236B04580D1200F409eE0834683bE49`. Asymmetric 3%/4%
  tax exposes mock-vs-real divergence cleanly.
- **Specific token to use (pre-graduation fixture):** Test-1
  `0x1f4d04b456b96893d8fe0467d07dc5d7ebfa7777`. 3%/3% symmetric tax,
  already 4% progress, comfortably finishable with a 16 BNB curve fill.
- **Specific BSC fork block:** for first-pass tests, pin to
  `FORK_BSC_BLOCK=97_312_500` (right after Test-1 was minted, before any
  organic graduation attempts). Adjust if Test-1 graduates organically;
  the research script in `/tmp/find-v3-graduated.mjs` and
  `/tmp/check-v8-correct.mjs` re-finds candidates in ~30s.
- **Specific test cases to add:** see Section 5 checklist above. Start with
  the read-state test (no BundleRouter changes), then the raw Portal
  graduation test, then the post-graduation negative case. Defer the
  full BundleRouter integration until C-3 is fixed in the contract.
- **Estimated complexity:**
  - Read-state + Portal-graduation tests: ~150 LOC, ~2 min runtime, no
    contract changes.
  - Post-graduation negative test: ~50 LOC.
  - BundleRouter refactor + e2e tests: ~200 LOC contract delta + ~300
    LOC test, ~3 min runtime. This is **a separate wave** because it
    touches `BundleRouter.sol`, which is in scope for the audit and
    needs a fresh codex review.

**Test file location:** `packages/contracts-evm/test/integration/real-flap.test.js`
(parallel to `full-flow.test.js`, shares the `FORK_BSC` env-var pattern).

**Env vars:**
- `FORK_BSC=true`
- `FORK_BSC_URL=https://bnb-mainnet.g.alchemy.com/v2/$ALCHEMY_BSC_KEY`
  (note: Sol's Alchemy BSC key in `~/.bashrc` returned "Must be authenticated"
  on a smoke test — it may be expired or the wrong product. Use a public RPC
  for now: `https://bsc-rpc.publicnode.com` worked for `eth_call`,
  `https://bsc.drpc.org` worked for `eth_getLogs` though rate-limited.)
- `FORK_BSC_BLOCK=97_312_500` (or current head)
- `REQUIRE_BSC_FORK=true` to make the test fail fast if fork is missing

---

## 7. Open Questions

- **Does Flap V3's tax processor's `dispatch()` get called inside our V2 buy?**
  V3 has a "bidirectional dynamic liquidation threshold" that auto-converts
  accumulated tax tokens to BNB on PCS V2 — this could move PCS V2 reserves
  during our test in unpredictable ways. If yes, we may need to use a token
  with very low taxProcessor balance, or pin to a block right after a
  dispatch.

- **Is `BundleRouter` exempt from `taxProcessor`'s tax in any way?** Almost
  certainly no on a real flap. We should expect to pay the buy tax on the V2
  buy leg.

- **Does `Portal.swapExactInput` for a curve buy emit `LaunchedToDEX` in
  the same tx if the buy crosses graduation?** Per docs, yes — the Portal
  triggers DEX migration in the same tx that pushes supply across threshold.
  This is convenient for atomic-bundle semantics.

- **Is there a `TaxTokenHelper` we should be using?** Docs reference a
  Tax Token Helper at `0x53841c73217735F37BC1775538b03b23feFD8346` —
  worth a 5-minute look in W42b but not in scope for this research.

- **Is `pool` from `getTokenV8` guaranteed to equal
  `factory.getPair(token, WBNB)` for tax tokens?** Verified for PTCG,
  XCHAT, BANK, 龙头, 苍生 (5/5). Once for RHC the factory returned `0x0`
  but a retry succeeded — RPC node desync, not a protocol issue.

- **What's the `commissionReceiver` address Flap uses for organic
  (non-launchpad) launches?** Likely `address(0)`. If non-zero, our V2 buy
  tokens lose another 0.6-6% to commission, and BundleRouter's
  `tokensToTax` math is off again. Worth reading `taxProcessor` state at
  fork time.

---

## 8. Next Steps

1. Land this report on `sol/wave-c3-flap-research`, push, no PR yet (audit
   docs branch).
2. W42b kicks off **after** the C-3 fix in `BundleRouter.sol` lands. The
   real-flap integration tests need the buy-entry-point to go through the
   Portal, which is a contract change.
3. In parallel, the read-state + Portal-graduation tests can land as a
   separate small PR — they don't need contract changes and they prove
   the test rig works.
4. Researcher artifacts (the `*.mjs` scripts in `/tmp/`) should be moved
   into `packages/contracts-evm/scripts/` if we want to keep them around
   for re-discovering candidates over time. They currently live only on
   Sol's VPS and will not survive `/tmp` cleanup.

---

*Research artifacts (scripts in `/tmp/` on the VPS):*
- `query-flap.mjs` — getTokenV7 against arbitrary addresses
- `check-v3.mjs` — verify TAX_V3_IMPL deployment + portal version
- `check-v8-correct.mjs` — getTokenV8 with the corrected struct ordering
- `find-v3-graduated.mjs` — sweep recent blocks for V3 token launches
- `verify-pools-slow.mjs` — cross-check Portal.pool vs PCS V2 factory.getPair

*Last sampled:* BSC mainnet, block 97_315_255, 2026-05-09 ~16:50 UTC.
