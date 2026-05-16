# Codex Retroactive Review - V3 Stack

Generated: 2026-05-09 by Sol (subagent: codex-retro-review)
Tool: `codex-cli 0.124.0` with `gpt-5.5` (sandbox: `danger-full-access`)
Scope: 8 critical PRs that landed during ~24h codex-broken window

> **Sandbox note:** default codex sandbox blocks loopback networking (`bwrap RTM_NEWADDR Operation not permitted`). All reviews here ran with `-c sandbox_mode='"danger-full-access"'`. The retro-review worktree is at `/home/shad0w/projects/waifu.fun-wt/codex-retro-review` on branch `sol/wave-codex-retro-review`.

---

## PR #485 — W40 LaunchFactory (`b8761d37`)
- **Critical (P1):**
  - **Factory-created routers have unreachable owner** — `LaunchFactory.sol:116-121`. `BundleRouter` records `msg.sender` as immutable owner, but that's the factory, not the creator. There's no ownership transfer and the factory exposes no proxy to call `execute`. Result: BNB forwarded by `LaunchVault.launch()` is stuck on the router; nobody can execute the bundle.
  - **30% of token supply permanently stranded in factory** — `LaunchFactory.sol:143-145`. The 200M V2 LP + 100M treasury allocations sit on the factory contract with no transfer/withdrawal method. Treasury wiring deferred to W33b never lands these tokens. Every launch leaks 300M tokens.
- **High:** _none_
- **Notes:** Both findings make the v3 launch flow non-functional end-to-end. Same root cause as PR #484 P1 (router/vault wiring).

## PR #486 — W41 Integration Tests (`81dff602`)
- **Critical:** _none_
- **High:** _none_
- **Medium (P2):**
  - **Exact vesting assertions break under fork timing** — `test/integration/full-flow.test.js:331-333`. Hardhat auto-mines blocks between `launch()` and the first claim, so vesting is slightly >50% (`block.timestamp - launchTimestamp` math). Subsequent `increaseTime(HALF_DAY)` puts it slightly >75%. Strict equality assertions will go flaky on the BSC fork. Use a tolerance or `setNextBlockTimestamp` relative to `launchTimestamp`.
- **Notes:** No correctness bugs in product code; CI flake risk. Test scaffold is otherwise solid.

## PR #483 — W38 LaunchVault (`c05012a3`)
- **Critical (P1):**
  - **`launch()` raw-transfers BNB instead of calling router execute** — `LaunchVault.sol:213`. With the BundleRouter wired in production, sending BNB only triggers `receive()` and never executes the bundle/V2-graduation logic. Vault still flips to `LAUNCHED`, claims open, but no market actually launches. BNB just sits on router.
- **High:** _none_
- **Medium (P2):**
  - **`closeTimestamp` not enforced on deposits** — `LaunchVault.sol:142`. Late depositors can enter past the advertised deadline if no keeper has called `close()` yet, diluting in-window depositors.
  - **Presale cap not enforced** — `LaunchVault.sol:150-151`. Vault accepts unbounded deposits even when factory tier specifies a cap. Oversubscribed rounds break tier economics.
- **Notes:** P1 is the same architectural break as PR #485 P1#1 / PR #484 P1#1. Boundary checks (close timestamp, cap) missing despite tier config knowing both.

## PR #484 — W37 LaunchRouter (`9a731b72`)
- **Critical (P1):**
  - **`msg.value` check incompatible with vault-forwarded BNB** — `BundleRouter.sol:81`. When `LaunchVault.launch()` already pushed BNB to the router via `receive()`, calling `execute()` has `msg.value == 0`, hitting `BnbMismatch` and reverting. Workaround of resending value strands the original vault BNB and sweeps it to `owner`, breaking launch funding.
  - **Curve-fill tokens stranded on router** — `BundleRouter.sol:85`. Tokens whose `buy()` mints to `msg.sender` end up owned by the router. Later V2 burn measures swap delta only, and the contract has no ERC20 sweep, so curve tokens cannot reach the vault/presalers.
- **High:** _none_
- **Notes:** Both P1s are part of the v3 launch wiring architectural break. Need coherent fix together with PR #485 and PR #483.

## PR #482 — W33 TreasuryLP (`cc78f6e0`)
- **Critical:** _none_
- **High:** _none_
- **Medium (P2):**
  - **Token-side V4 fees ignored on claim** — `TreasuryLP.sol:268`. `collect` returns `(amount0, amount1)` but the function discards both and only uses native BNB balance delta. Token-only fee accruals revert with `nothing_to_claim`; mixed accruals leave token fees stuck or accidentally counted as future tier inventory.
- **Notes:** Doesn't break boot-up; manifests once trading happens and the agent token side accrues V4 fees.

## PR #487 — W33b TreasuryLP4 (`b08482a4`)
- **Critical:** _none_
- **High:** _none_
- **Medium (P2):**
  - **Stale 540M cap copied to 4-tier contract** — `TreasuryLP4.sol:197`. Tests document 4 × 25M = 100M total, but constructor still allows totals up to 540M (the 12-tier limit). Misconfigured deployments succeed at construction and revert with `insufficient_tokens` later when funding doesn't match.
- **Notes:** Defense-in-depth issue. Cap should match the 100M reserved by the launch factory for treasury allocation.

## PR #488 — W42 Launch API (`117ceb3e`)
- **Critical (P1):**
  - **Unauthenticated public POST /v2/launches** — `apps/api/src/routes/v2/agent-launches.ts:169-172`. With `LAUNCH_FACTORY_SIGNER_PK` configured, anyone can submit arbitrary `creator`/tier/metadata and force the API signer to spend gas. Drains signer wallet; allows impersonation of arbitrary `creator` addresses. Needs SIWE/patron-wallet ownership check before broadcasting.
- **High:** _none_
- **Medium (P2):**
  - **Hard 1000-row cap on depositor aggregates** — `apps/api/src/services/launch-v2/launch-repo.ts:151-152`. `listDepositors` truncates to 1000 with no pagination signal. The same helper backs single-address lookups, so users outside the first 1000 incorrectly appear as zero-deposit when RPC enrichment is unavailable.
- **Notes:** P1 must be fixed before signer key is set in any environment. Even staging is dangerous because the signer wallet still costs real BNB.

## PR #491 — W43 Bundle Submitter (`310fabde`)
- **Critical (P1):**
  - **Wrong Puissant JSON-RPC method name** — `apps/api/src/services/bundle-submitter/puissant-client.ts:68`. Calls `eth_sendPrivateRawTransaction`. 48 Club Puissant docs the method as `eth_sendPrivateTransaction` (single signed-raw-tx param). Production calls will return JSON-RPC method-not-found, falling through to public mempool (or failing entirely if `fallbackPublic=false`). Private path is effectively dead.
- **High:** _none_
- **Notes:** Verify against current 48 Club docs (https://docs.48.club/puissant-builder/send-privatetransaction). May also want to confirm endpoint host/auth headers.

---

## Per-PR review files
- `PR485_review.md` — full codex output
- `PR486_review.md`
- `PR483_review.md`
- `PR484_review.md`
- `PR482_review.md`
- `PR487_review.md`
- `PR488_review.md`
- `PR491_review.md`
