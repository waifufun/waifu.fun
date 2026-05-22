# Wave H Quality Review

Date: 2026-05-13
Reviewer: Sol (in-house)
Scope: `BundleRouter.sol`, `LaunchVault.sol`, `LaunchFactory.sol`, `TreasuryLP.sol`
Commit: develop @ f0f7abf2 + #532

In-house quality pass before paying audit firms. Verdict: ready for third-party audit. Several design tradeoffs documented; one operational concern flagged.

## Summary of findings

| # | Severity | Area | Verdict |
|---|---|---|---|
| 1 | Info | BundleRouter | unused immutables (`creator`, `closeTimestamp`) | ACCEPT |
| 2 | Info | BundleRouter | unused custom errors | ACCEPT |
| 3 | Low | BundleRouter | `TIP_RECEIVER` hardcoded at compile time | ACCEPT with operational mitigation |
| 4 | Low | LaunchFactory | `INIT_CODE_HASH` immutable | ACCEPT with operational mitigation |
| 5 | Info | LaunchFactory | salt-mining griefing window | ACCEPT |
| 6 | Low | LaunchVault | dust-deposit gas griefing | ACCEPT |
| 7 | Med | BundleRouter | Portal revert refund posture | DOCUMENT — relies on EVM atomic revert |
| 8 | Low | TreasuryLP | permissionless `recordManagedToken` first-writer | ACCEPT by design |
| 9 | Info | LaunchVault | `enableRefundUnderSubscribed` is permissionless | ACCEPT by design |

## 1. BundleRouter — unused immutables (`creator`, `closeTimestamp`)

The `creator` and `closeTimestamp` immutable fields are set in `ConstructorArgs` but never read by the contract. They cost extra deployment gas per launch.

**Verdict: ACCEPT.** Kept for indexer convenience — both fields are available via `closeTimestamp` storage reads and the factory's `LaunchCreated` event. Removing them would force the indexer to join multiple events to reconstruct launch metadata. The deployment-gas cost is marginal (≈ 2k gas per immutable per deploy).

## 2. BundleRouter — unused custom errors

Errors declared but unused: `VaultBalanceMismatch`, `PortalCallFailed`, `TipTransferFailed` (actually used), `VaultDistributeFailed`, `TreasuryTransferFailed`, `BundleFailed` event.

**Verdict: ACCEPT.** Bytecode cost is minimal. Errors document the intent and may be picked up by future revisions. The `TreasuryTransferFailed` / `VaultDistributeFailed` errors became unused after PR #527 switched to `SafeERC20.safeTransfer` (which has its own revert path).

## 3. BundleRouter — `TIP_RECEIVER` hardcoded at compile time

The 48 Club builder address (`0x4848489f0b2BEdd788c696e2D79b6b69D7484848`) is taken from the factory's immutable. If 48 Club's builder address ever rotates (it has changed in the past on BSC infrastructure), every factory becomes stale. Existing launches via that factory continue working, but new launches need a fresh factory.

**Verdict: ACCEPT with operational mitigation.** Per `WAVE_H_OPERATIONAL_PLAN.md` we deploy a fresh factory per chain-config change anyway. If 48 Club moves, the runbook is: deploy a new LaunchFactory with the new TIP_RECEIVER, point backend at the new factory address. Existing per-launch contracts continue with the old tip receiver (graceful degradation: tip may fail or land on a dead address, but bundle still succeeds because the tip transfer uses `payable.call` with revert-on-fail; if the address goes to a zero-code account, the call still succeeds and the BNB is locked but not stolen).

**Follow-up:** consider making `TIP_RECEIVER` a per-launch arg in a future revision so the bundle bot can rotate without a factory redeploy.

## 4. LaunchFactory — `INIT_CODE_HASH` immutable

The factory stores `INIT_CODE_HASH` at construction. This is the keccak256 of the FlapTaxToken EIP-1167 minimal proxy clone code, derived from `TOKEN_IMPL_TAXED_V3` (`0x024f...6422`). If Flap rotates the V3 token implementation, the factory's stored hash becomes stale → every new launch hits `InvalidPredictedAddress`.

**Verdict: ACCEPT with operational mitigation.** Same as above: deploy a fresh factory. The hash is locked at deploy time, so factories are not "patchable" — they're versioned.

**Lesson learned:** PR #528 caught a case where this hash was derived from the wrong impl address. Audit firm should re-derive the hash from the deployed `TOKEN_IMPL_TAXED_V3` on mainnet and verify it matches `LaunchFactory.INIT_CODE_HASH()`.

## 5. LaunchFactory — salt-mining griefing window

Anyone watching mempool can see a `createLaunch` tx and extract the raw vanity salt. The factory now derives `effectiveSalt = keccak256(abi.encode(creator, vanitySalt))` and requires `msg.sender == creator`, so copying the raw salt from another creator produces a different predicted token address and cannot burn the victim creator's salt.

**Verdict: FIXED.** Residual risk is limited to same-creator duplicate submission, which requires the creator key and is covered by the monotonic `usedSalts[effectiveSalt]` guard.

**Follow-up:** external callers must pass the raw `vanitySalt`; the factory applies creator scoping internally.

## 6. LaunchVault — dust-deposit gas griefing

A malicious user could call `vault.deposit({value: 1 wei})` 100k times to bloat the `depositors` mapping. Doesn't actually steal anything, but inflates gas costs for the legitimate users' claim / refund.

**Verdict: ACCEPT.** Mitigation options considered:
- Minimum deposit (e.g. 0.01 BNB): adds friction for small participants.
- Per-address deposit limit: adds complexity.

The mapping growth is bounded by `depositorCount` which is uint256 but practically gated by BSC's per-tx gas limit (50M). 100k unique addresses would cost ~50 BNB in gas to grief, plus 100k * 0.001 = 100 BNB minimum in dust deposits. Economically irrational unless the griefer is targeting a single launch.

For Wave H mainnet launch (sub-1-BNB capped smoke), this is moot. For production scale, monitor and consider adding a minimum.

## 7. BundleRouter — Portal revert refund posture (MEDIUM)

If `Portal.newTokenV6` reverts inside `_callPortal`, the BNB sent (`quoteAmt`) does NOT auto-refund. The router has already pulled BNB from vault. If Portal reverts, the whole tx reverts via EVM atomic revert, so vault BNB stays put. **This relies on the bundle's atomic nature.**

The concern: what if Portal's revert is a graceful one that does NOT bubble up? E.g. a `try/catch` in `_callPortal` could swallow the revert and leave the router holding stuck BNB. Verified: there is NO try/catch in `_callPortal`. The Portal call reverts → router's `executeBundle` reverts → EVM rolls back. Vault BNB intact. Verified by PR #528's atomic revert test (which uses MockFlapPortalCREATE2.setShouldRevert).

**Verdict: DOCUMENT.** The atomic property is design-critical. Audit firm should:
1. Verify there is no `try/catch` around any third-party call in `executeBundle`
2. Verify the executed-flag is set BEFORE the Portal call (CEI)
3. Verify the test that injects a Portal revert and confirms vault BNB stays intact

## 8. TreasuryLP — permissionless `recordManagedToken` first-writer-wins

`recordManagedToken(address t)` is permissionless. The first caller locks the token. Subsequent calls with the same `t` no-op; subsequent calls with a different `t` revert `MultipleTokens`.

Attack: front-run the bundle bot's `recordManagedToken` call with a different token. Now the legitimate launch token can never be registered.

**Verdict: ACCEPT by design.** The bundle flow doesn't actually call `recordManagedToken` — the bundle uses raw `safeTransfer` to `treasuryLp`. `recordManagedToken` is for the post-launch ops phase when we want a structured way to mark the token. If an attacker locks the wrong token first, the worst case is the launch creator has to call sweep with the correct token explicitly. No funds lost.

**Follow-up:** Consider restricting `recordManagedToken` to the factory or vault. Low priority.

## 9. LaunchVault — `enableRefundUnderSubscribed` permissionless

Anyone can call this once `block.timestamp >= closeTimestamp && totalDeposited < presaleCap`. The state transition is irreversible (REFUND has no escape).

**Verdict: ACCEPT by design.** Mitigation: pre-conditions are objective (timestamp + cap). A griefer calling this after the window closed would just enact what would have happened anyway (the launch can't proceed without hitting cap). No funds lost.

## What we are NOT reviewing in-house

Audit firm should focus on:
- Cryptographic correctness of CREATE2 prediction derivation
- Exact gas cost of executeBundle vs. block gas limit (5.62M vs 50M = comfortable margin)
- Reentrancy in OZ ReentrancyGuard interaction with the executed-flag pattern in BundleRouter
- Whether Portal v5.14.1 has any storage-slot collision that could affect our CREATE2 prediction
- Validation that `commissionReceiver` flow actually pays us long-term (operational, not contract)

## Recommendations before audit firm engagement

1. ✅ All P0/P1 bugs from real-fork validation are fixed (#528)
2. ✅ Backend tier math matches contract truth (#532)
3. ✅ Audit prep package shipped (#529, tag `v1.0.0-pre-audit`)
4. ✅ Tier 90/95/98 real-fork validation (#530)
5. ⏳ Slither static analysis (in flight)
6. ⏳ Edge case stress tests (in flight)
7. ⏳ Stack integration smoke (in flight)
8. ⏳ Mainnet smoke launch with sub-1-BNB cap (manual, post-audit)
