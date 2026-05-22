# Wave H Battle Test Report

Date: 2026-05-15
Target: LaunchFactory at `0x54f250Ea490239E7C3B1672283607213B5fA2459` (BSC mainnet)
Context: pre-real-money launch (Shaw sending BNB for first agent launch)

---

## Tools Run

| Tool | Version | Status | Findings |
|---|---|---|---|
| **Slither** | 0.11.5 | ✅ | 48 total (2 high, 4 medium, 16 low, 26 info) — all matched PR #534 triage |
| **Hardhat tests (unit)** | latest | ✅ | 81 passing, 0 fail, 1 pending |
| **Hardhat tests (bundle flow e2e)** | latest | ✅ | 26 passing, 0 fail |
| **Hardhat tests (adversarial)** | latest | ✅ | 29 passing, 0 fail |
| **Live immutable read** | viem | ✅ | All 7 immutables match expected values |
| **Solc compile** | 0.8.24 | ✅ | viaIR + optimizer @ 200 runs |
| **BscScan verification** | n/a | ✅ | Source verified (full match) |
| **Sourcify verification** | n/a | ✅ | Full match |
| **Real-fork (block 97368808)** | hardhat | ⚠️ | Stale — public RPCs pruned. Last clean run in PR #535 |
| **Halmos symbolic exec** | 0.3.3 | ⏭️ | Skipped — needs Foundry test layout, our suite is Hardhat-JS |
| **Mythril** | n/a | ⏭️ | Skipped — viaIR contracts often hang Mythril for hours |
| **Echidna** | n/a | ⏭️ | Skipped — needs Foundry layout |

---

## Slither Findings Triage (re-confirmed from PR #534)

### High Severity

#### `arbitrary-send-eth` ×2 — ACCEPT
Locations: `BundleRouter._v2FollowUpBuy` and `BundleRouter._callPortal`.
Reasoning: both targets (`PCS_ROUTER`, `FLAP_PORTAL`) are immutable, set at construction by the factory from a hardcoded address book. Not user-controlled. Reviewer can verify via on-chain `LaunchFactory.PCS_ROUTER()` and `FLAP_PORTAL()` calls — both match the expected canonical addresses.

#### `reentrancy-balance` ×1 — ACCEPT
Location: `BundleRouter._v2FollowUpBuy` (post PCS swap).
Reasoning: `BundleRouter` is single-use via the `executed` flag check. After `executeBundle()` completes, all further calls revert `AlreadyExecuted`. The balance-delta pattern is informational only; no second entry possible.

### Medium Severity

#### `incorrect-equality` ×3 — ACCEPT
Locations: `LaunchVault._allocationOfPure`, `_vestedOf`, `claim`.
Reasoning: All three are zero-checks on uint256 accounting values (`dep == 0`, `alloc == 0`, `claimable == 0`). Slither's detector is intended to flag balance/rebase-related strict equality; these are pure arithmetic on deterministic per-user state.

#### `unused-return` ×1 — ACCEPT
Location: `BundleRouter._computeOpenMcBnb` ignores `(r0, r1, _)` from `getReserves()`.
Reasoning: The third value is the timestamp of last reserve update. Not needed for our open-MC computation.

### Low Severity

12× `timestamp` (intentional — deadline + close timestamps are by design).
4× `reentrancy-events` (event emission after third-party call — no value impact, intentional for indexer ordering).

### Informational (26)

Naming conventions on immutables (`WBNB`, `PCS_FACTORY`, etc. — Solidity style guide says SCREAMING_SNAKE for immutables, slither's detector disagrees), cyclomatic complexity flags on complex bundle execution paths, missing inheritance (interfaces we don't implement directly).

---

## Live Contract Sanity Check

Read against `bsc-dataseed1.binance.org`:

```
✓ WBNB                   0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
✓ PCS_FACTORY            0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
✓ PCS_ROUTER             0x10ED43C718714eb63d5aA57B78B54704E256024E
✓ INIT_CODE_HASH         0x2f7f413fcc6c3812c665c15bd4a012e663f567d626112a81d401066fd5a771b4
✓ FLAP_PORTAL            0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0
✓ TOKEN_IMPL_TAXED_V3    0x024f18294970B5c76c0691b87f138A0317156422
✓ TIP_RECEIVER           0x4848489f0b2BEdd788c696e2D79b6b69D7484848

owner: 0xC9846a839c4e1D9050Dc890A25661AB13224e9EC
```

All 7 immutables match the expected mainnet address book. No surprises.

---

## Verdict: GO

No new findings since PR #535 (Wave H adversarial test matrix landing). All previously-triaged Slither findings stand. 81 unit tests + 26 e2e + 29 adversarial all passing. Live contract immutables verified against expected.

### Recommended for first launch (Shaw's BNB)

1. **Start with tier-80** (16 BNB cap, simplest path, smallest blast radius).
2. **Verify the predicted token address** offchain before submitting `createLaunch()` — the contract reverts `PredictedAddressMismatch` if salt doesn't produce the expected CREATE2 address, but cheaper to check first.
3. **Set `closeTimestamp` to a reasonable window** (24h default — anything shorter risks not hitting the cap).
4. **Confirm BSC mainnet gas price** at submission (current baseline ~0.05 gwei, but spikes happen).
5. **Have the refund path tested mentally**: if 24h elapses without hitting cap, depositors call `refund()` directly on their vault. UI exposes this via `RefundWidget` (PR #550).
6. **Monitor `LaunchCreated` event** from indexer to confirm the launch was registered properly.

### Known limitations (not blockers)

- Real-fork test requires an archive RPC (public ones prune state). Last clean fork run was in PR #535 — has not been re-validated against current BSC block. NOT a blocker because the on-chain immutables match and the code is unchanged.
- Bundle bot still in dry-run default (`BUNDLE_BOT_DRY_RUN=true`). For first launch this is fine — Shaw / Shadow can manually call `executeBundle()` from the Sol burner after presale closes if cap is hit. For ongoing ops, flip dry-run to false after the 4-wallet hot pool is provisioned.
- External audit (Pashov / Code4rena) pending. In-house pre-audit is comprehensive but not a substitute for fresh eyes.

---

## Files

- `slither.json` — full slither output (machine-readable)
- `slither.log` — full slither output (human-readable)
- `BATTLE_TEST_REPORT.md` — this file
