# V3 Stack Retroactive Review — Consolidated Summary

**Date:** 2026-05-09
**Reviewer:** codex-cli 0.124.0 / gpt-5.5 (sandbox: danger-full-access)
**Trigger:** V3 audit H-5 finding — codex auth was broken for ~24h while ~21 PRs landed.
**Scope:** 8 highest-risk PRs (W33, W33b, W37, W38, W40, W41, W42, W43).

---

## Findings By Severity

| Severity | Count | PRs |
|----------|-------|-----|
| **P1 (Critical)** | **7** | #485 (×2), #483 (×1), #484 (×2), #488 (×1), #491 (×1) |
| **P2 (Medium)**   | **6** | #486 (×1), #483 (×2), #482 (×1), #487 (×1), #488 (×1) |
| **P3 (Low/Style)**| 0 | — |

**Net:** 13 unique findings across 8 PRs. **5 of 8 PRs have at least one P1.** Two PRs (#486, #482, #487) are P2-only, but the contract trio (#485 / #484 / #483) collectively breaks the launch flow.

---

## Top 5 Must-Fix (P0 from a deploy-readiness standpoint)

1. **Launch wiring is broken end-to-end.** PRs #485, #484, #483 share one architectural bug: the BundleRouter is owned by the factory (not the creator), `LaunchVault.launch()` raw-transfers BNB instead of calling `BundleRouter.execute(...)`, and `BundleRouter.execute` enforces `msg.value == curveFillBnb + v2BuyBnb` even when the vault has already pushed funds. **Net:** every v3 launch will close → flip vault to `LAUNCHED` → BNB strands on router → no market launches → claims open against tokens that were never bought. **Fix scope:** redesign vault↔router handshake as a single function call with explicit ownership transfer or a privileged `executeFromVault` path, plus an ERC20/native sweep so curve-fill tokens reach presalers.

2. **30% of every launch's token supply is permanently lost (PR #485).** The factory holds 200M LP + 100M treasury per launch with no `withdraw`/`forward` path. Even after W33b lands TreasuryLP4 wiring, all launches deployed before that wiring will have stranded 30%. **Fix scope:** add a creator/owner-gated egress (e.g., `forwardTreasuryAllocation`) before next deploy, even as a temporary scaffold; document migration for any launches already created.

3. **Public POST /v2/launches with no auth (PR #488).** With `LAUNCH_FACTORY_SIGNER_PK` set, the API signer pays gas for any caller with any `creator` address. Anyone can drain the signer wallet or create launches in someone else's name. **Fix scope:** require SIWE auth + patron-wallet ownership check (`creator == authenticated wallet`) before calling `service.createLaunchOnchain`. Block deploy of `LAUNCH_FACTORY_SIGNER_PK` until this lands.

4. **Wrong Puissant RPC method name (PR #491).** Bundle submitter calls `eth_sendPrivateRawTransaction`, but 48 Club documents `eth_sendPrivateTransaction`. Private-path inclusion will never work; everything falls through to public mempool (or fails outright if `fallbackPublic=false`). **Fix scope:** validate against current 48 Club docs, fix method name and verify param shape, smoke-test against testnet endpoint.

5. **Vault accepts late and oversubscribed deposits (PR #483 P2 ×2).** No `closeTimestamp` enforcement on `deposit`, no presale cap enforcement. Late depositors dilute legitimate ones; oversubscription breaks tier economics for the v2 buy. **Fix scope:** add `if (block.timestamp >= closeTimestamp) revert` + `if (totalDeposited + msg.value > presaleCap) revert` (or refund-the-overflow), wire `presaleCap` into the vault from factory.

(Honorable mentions, P2 each: TreasuryLP claim ignoring token-side V4 fees [#482], TreasuryLP4 stale 540M cap copy [#487], integration test exact-vesting flake [#486], API depositor list silent truncation at 1000 [#488 P2].)

---

## Recommended Follow-Up Wave Structure

### Wave A — V3 Launch-Wiring Hotfix (P1 contract trio)
**Goal:** Make the v3 launch flow actually work end-to-end before any mainnet attempt.
- A1. Redesign LaunchVault → BundleRouter handoff. Vault calls `router.executeFromVault(params)` (privileged, only-vault) so router sees `msg.value`-equivalent funds without re-transfer.
- A2. Transfer BundleRouter ownership to `creator` at end of `createLaunch` (or use a per-vault privileged caller pattern instead of immutable owner).
- A3. Sweep curve-fill tokens: BundleRouter.execute should forward purchased-but-not-burned tokens to the vault for pro-rata claims.
- A4. Re-run W41 integration tests with the new wiring; tighten timestamp handling per #486 P2.
- **Tag:** wave-w40b-launch-wiring-fix

### Wave B — Factory Token Egress (P1)
**Goal:** Don't strand 30% of every launch.
- B1. Add `forwardLpAllocation(token, recipient)` and `forwardTreasuryAllocation(token, recipient)` on LaunchFactory, gated to creator/owner.
- B2. Decide migration plan for any pre-existing launches (likely none yet; verify on testnet).
- **Tag:** wave-w40c-factory-egress

### Wave C — API Auth + DoS Hardening (P1)
**Goal:** Don't let the launch signer get drained.
- C1. SIWE/patron-wallet check on POST /v2/launches; require `body.creator == auth.wallet`.
- C2. Rate-limit the route per-wallet AND globally.
- C3. Paginate `listDepositors`; uncapped indexed lookup for single-address aggregate.
- **Tag:** wave-w42b-launch-api-hardening

### Wave D — Bundle Submitter Correctness (P1)
**Goal:** Make the private path actually private.
- D1. Verify 48 Club RPC method+params, fix `puissant-client.ts`.
- D2. Add a fork or mock-endpoint test that asserts the exact JSON-RPC envelope.
- D3. Document fallback semantics in code comment so reviewers can verify.
- **Tag:** wave-w43b-bundle-submitter-fix

### Wave E — Vault Boundary Enforcement (P2)
- E1. Enforce `closeTimestamp` on `deposit`.
- E2. Pass `presaleCap` from factory into vault constructor; enforce on `deposit` (refund overflow or revert).
- E3. Update unit tests; add fuzz/property tests for cap and deadline.
- **Tag:** wave-w38b-vault-boundaries

### Wave F — Treasury LP Polish (P2)
- F1. TreasuryLP/TreasuryLP4: handle `(amount0, amount1)` from `collect` properly; route token-side fees explicitly (sell-back, hold, or ignore intentionally).
- F2. Tighten TreasuryLP4 token cap to 100M to match launch reserve.
- **Tag:** wave-w33c-treasury-lp-polish

---

## Redesign vs Simple Fix

**Requires partial redesign (not just patching):**
- **Wave A (launch wiring).** The current vault/router/factory contract trio doesn't compose cleanly. The `BundleRouter.execute` ABI assumes EOA caller with `msg.value`, the vault uses `receive()` push, the factory owns the router. Fixing this cleanly likely means a new function on BundleRouter (or making LaunchVault the router's caller via a single atomic call), plus rethinking ownership/permissions. **This is more than a one-line fix.**

**Simple fixes (line-level or small-PR scope):**
- B (factory egress functions): two new functions + access control.
- C (API auth + pagination): wire existing SIWE middleware, paginate one query.
- D (Puissant RPC name): one-line + add test.
- E (vault boundaries): two reverts + one constructor arg + tests.
- F (treasury polish): two tweaks + cap constant.

---

## Process Notes / Lessons

- Codex sandbox default is locked-down (loopback restricted in bubblewrap). For workspaces under `~/projects/...` we need `-c sandbox_mode='"danger-full-access"'` for `codex review` to function. Consider configuring `sandbox_mode` default in `~/.codex/config.toml` or wrapping `codex review` in a Sol script that sets it.
- All 8 PRs landed in ~24h with no codex review at merge time. The findings here are exactly the kind of issues codex normally surfaces pre-merge. **Strongly recommend:** block merges of contract-touching or signer-touching PRs until codex review passes. The W42 unauthenticated POST is the most damning — that is a textbook codex-catchable issue.
- gpt-5.5 reviews ran 60-300s each; in parallel, total wall-time was ~4 minutes for all 8. Cost-efficient and high-signal.

---

## Artifacts
- `INDEX.md` — per-PR finding index
- `PR485_review.md` ... `PR491_review.md` — raw codex outputs
- Branch `sol/wave-codex-retro-review` at `/home/shad0w/projects/waifu.fun-wt/codex-retro-review` (working tree)
