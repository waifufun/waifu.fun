# launch-indexer wave H/I event coverage audit

date: 2026-05-13
auditor: sol (subagent, wave I)
scope: `apps/launch-indexer/*`, `apps/tier-cron/*`, contracts in `packages/contracts-evm/contracts/{LaunchFactory,LaunchVault,BundleRouter}.sol`

## tl;dr

the wave H contracts (PR #525, #527, #528) renamed and re-shaped almost every event the indexer cares about, but the indexer ABIs were never updated past wave G. result: every single launch-related event would either fail to decode entirely or land on a handler with the wrong field names. wave H was effectively un-indexed.

this audit re-syncs the indexer's ABIs, types, decoders, and handlers to the on-chain reality, adds handlers for the three brand new events (`Distributed`, `BundleFailed`, `RouterSet`), tightens idempotency, and adds a stuck-launch detector in tier-cron.

## event coverage matrix

| contract | event | wave H signature | indexer handler | DB column(s) updated | tested |
|---|---|---|---|---|---|
| LaunchFactory | LaunchCreated | `(bytes32 launchId indexed, address creator indexed, address predictedToken indexed, address vault, address router, address treasuryLp, uint8 tier, uint256 presaleCap, uint256 v2BuyBnb, uint256 closeTimestamp)` | handleLaunchCreated | tokenAddress, predictedTokenAddress, vaultAddress, routerAddress, treasuryLpAddress, creator, tier, presaleCap, v2BuyBnb, state, closeTimestamp, createTxHash, createBlockNumber | yes |
| LaunchVault | RouterSet | `(address router indexed)` | handleRouterSet (log only) | none (wiring confirmation) | yes (poller round-trip) |
| LaunchVault | Deposited | `(address user indexed, uint256 amount, uint256 newTotal)` | handleDeposited | launchDeposits row + agentLaunches.totalDeposited, depositorCount | yes |
| LaunchVault | Withdrawn | `(address user indexed, uint256 amount, uint256 penalty, uint256 refund)` | handleWithdrawn | launchWithdrawals row + totalDeposited, bonusPool | yes |
| LaunchVault | Closed | `(address by indexed, uint256 totalDeposited, uint256 bonusPool)` | handleClosed | state=closed, totalDeposited, bonusPool | yes |
| LaunchVault | LaunchExecuted | `(address token indexed, uint256 totalBnb, uint256 timestamp)` | handleLaunchExecuted | state=launched, launchTimestamp | yes |
| LaunchVault | Distributed | `(address token indexed, uint256 presalerShare)` | handleDistributed (NEW) | flapTokenAddress, bundleStatus=confirmed | yes |
| LaunchVault | RefundEnabled | `(address by indexed, string reason)` | handleRefundEnabled | state=failed, failureReason | yes |
| LaunchVault | Refunded | `(address user indexed, uint256 principal, uint256 bonus, uint256 refundAmount)` | handleRefunded | launchWithdrawals row + totalDeposited, bonusPool | yes |
| LaunchVault | Claimed | `(address user indexed, uint256 amount, uint256 totalClaimed)` | handleClaimed | launchClaims row | yes |
| BundleRouter | BundleExecuted | `(address token indexed, address pool indexed, uint256 quoteAmt, uint256 v2BuyBnb, uint256 tokensReceived, uint256 tokensBurned, uint256 tokensToTreasury, uint256 tokensToVault, uint256 tipPaid, uint256 openMcBnb)` | handleBundleExecuted | state=launched, flapTokenAddress, v2Pair, openMcBnb, curveFillBnb, tokensFromV2, tokensBurned, bundleTxHash, bundleStatus=confirmed | yes |
| BundleRouter | BundleFailed | `(string reason)` | handleBundleFailed (NEW) | bundleStatus=failed_retry, bundleFailureReason | yes |
| Flap Portal | TokenCreated | `(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)` | handlePortalTokenCreated | flapTokenAddress, state=launched, launchTimestamp, bundleStatus=confirmed | partial (no unit test, code path exercised in poller test indirectly) |
| Flap Token | LaunchedToDEX | `(address token indexed, address pair indexed, uint256 quoteAmt)` | handleFlapLaunchedToDex | v2Pair, curveFillBnb, state=launched | partial |

## gaps found

### P0 — indexer ABIs vs on-chain contracts diverged after wave H

**all of:**
- `LaunchCreated` indexed `address indexed token`; wave H emits `bytes32 indexed launchId` + `address indexed predictedToken`. `taxSplitter` and `treasuryReserve` were removed from the event entirely; `treasuryLp` was added. wave H also added a `closeTimestamp` field.
- `Launched` was renamed to `LaunchExecuted`. third field renamed `launchTimestamp -> timestamp`.
- `RefundsEnabled()` (no args) was replaced with `RefundEnabled(address indexed by, string reason)`.
- `Refunded` lost its `newTotal` field.
- `BundleExecuted` was almost entirely rewritten: `(flapToken, v2Pair) -> (token, pool)` for the indexed pair, and the body changed from `(curveFillBnb, v2BuyBnb, tokensFromV2, tokensBurned, tokensToTax, openMcBnb)` to `(quoteAmt, v2BuyBnb, tokensReceived, tokensBurned, tokensToTreasury, tokensToVault, tipPaid, openMcBnb)`.
- entirely missing: `RouterSet`, `Distributed`, `BundleFailed`.

every running wave H launch would have left the indexer silently dropping decodes (viem returns null on signature mismatch, decoder returns null, caller skips).

**fix:** re-synced all of `apps/launch-indexer/src/lib/{abis,events,decode}.ts` to the wave H source-of-truth. added handlers for `RouterSet`, `Distributed`, `BundleFailed`. updated `handleBundleExecuted` to surface tip + treasury token splits and to set `bundleTxHash`. updated `handleLaunchCreated` to record `predictedTokenAddress` from the event, set `tokenAddress = predictedToken` initially, and read `closeTimestamp` from the event payload (was previously block timestamp, off by minutes-to-hours).

### P0 — idempotency holes on Deposited / Withdrawn / Refunded

even with `onConflictDoNothing` on the dedup-by-(txHash, logIndex) inserts, the existing handlers always ran the `update agentLaunches.totalDeposited` step. so a reorg or restart-from-snapshot replay would:
- re-overwrite totalDeposited with a stale `newTotal` (Deposited)
- double-subtract `amount` from totalDeposited (Withdrawn)
- double-bump depositorCount

**fix:** every handler that inserts into a `*_tx_log_unique` table now bails after `.returning()` confirms no fresh row was inserted. `handleWithdrawn` also now credits `bonusPool += penalty` on first observation (the contract bookkeeping does this; we were not mirroring it).

### P1 — stuck-launch detection was non-existent

tier-cron looped over `state=launched` rows to drive tier advancement, and it polled `state in (pending, failed_retry)` for bundle submission, but nothing alerted when a launch sat in `state=open` or `state=closed` past its `closeTimestamp` without ever progressing. so a misfiring bundle bot or an under-subscribed launch would just sit there indefinitely.

**fix:** added `LaunchRepo.listStuckLaunches(now, grace)` + `STUCK_LAUNCH_GRACE_SECONDS = 6h` in `apps/tier-cron/src/poller.ts`. each poll round logs a warning per stuck launch with secondsStuck + bundleStatus + bundleAttempt. operators can wire log-based alerts off this.

### P1 — on-chain auto-refund call is not yet wired

the stuck detector currently only logs. firing `enableRefundUnderSubscribed()` on-chain requires (a) the bundle bot or factory owner signer key in tier-cron (currently has `signerPrivateKey` for tier writes but no policy for refund calls), and (b) a careful state check against the vault to avoid double-flipping a launch that's mid-bundle.

**followup (P1) — FIXED in wave J:** added `apps/tier-cron/src/refund-cron.ts`. each poll round it scans for launches stuck >12h with `bundleStatus in (pending, failed_retry)` AND `state in (open, closed)`, reads `(totalDeposited, presaleCap)` from the vault to confirm under-subscription, simulates `enableRefundUnderSubscribed` against the configured tier-cron signer, and (only when `ENABLE_AUTO_REFUND_CRON=1`) sends the tx. simulate-revert is treated as a no-op (state already REFUND/LAUNCHED). dry-run honored. feature-flagged off by default. observability via `tier_cron_auto_refund_{simulated,sent,failed}_total` counters.

### P2 — wallet pool stuck-lock detection

`bundle_wallet_pool.next_available_ts` can stay in the past forever if `releaseWallet` is never called and the cooldown is bumped on each attempt. there's no alert if a wallet has been locked > N minutes.

**followup (P2) — FIXED in wave J:** added `apps/tier-cron/src/wallet-pool-health.ts`. each poll round it scans active wallet pool rows, warn-logs + bumps `bundle_wallet_pool_stuck_seconds` whenever `next_available_ts > now + 5 * BUNDLE_WALLET_COOLDOWN_SECONDS` (90s * 5 = 7.5min). inactive wallets are ignored. ops can wire a log-based alert off the warn log or the counter.

### P2 — partial test coverage on Flap Portal handlers

`handlePortalTokenCreated` / `handleFlapLaunchedToDex` are exercised end-to-end by `poller.test.ts`'s round-trip flow but lack standalone unit tests asserting field-by-field DB writes. low risk (small handlers, simple shape) but worth filling in.

**followup (P2) — FIXED in wave J:** added `apps/launch-indexer/src/handlers/flap.test.ts`. covers field-by-field DB writes for both handlers + the new gap #20 warn + counter path (see below) + the symmetric `LaunchedToDEX` orphan path.

### P2 — reorg / restart-from-snapshot safety is shallow

current strategy: every handler is keyed on `(tx_hash, log_index)` for inserts, and the launch row is unique on `tokenAddress`. that's enough to survive a clean replay, but a real reorg where the same `(tx_hash, log_index)` reappears at a different block number would slip through because we don't store `block_hash`.

**status: SHIPPED (waifufun#601).** previously deferred as an accepted risk (wave J) on the reorg-depth safety bound described below; shipped proactively rather than waiting for the phantom-row trigger. _historical rationale:_ BSC reorg depth has empirically been bounded by 1-2 blocks since the 2022 hard fork; we wait `confirmations >= 3` (set via `LAUNCH_INDEXER_CONFIRMATIONS`, default 3) before processing, which put the probability of a reverted `(txHash, logIndex)` re-appearing at a different block number well below the cost of the migration. that bound still holds — the migration just closes the gap unconditionally, which also unblocks lowering `LAUNCH_INDEXER_CONFIRMATIONS` or porting the indexer to a deeper-reorg chain (L2 sequencer) without revisiting dedup safety.

**followup (P2): DONE in `0038_condemned_mercury.sql`.** `block_hash varchar(66) NOT NULL DEFAULT '0x00…00'` added to `launch_deposits`, `launch_withdrawals`, `launch_claims`; each `*_tx_log_unique` key swapped to `(tx_hash, log_index, block_hash)`. (`launch_refunds_log` named in the original followup does not exist — refunds are recorded as `launch_withdrawals` rows.) handlers now populate `block_hash` from `event.blockHash` (threaded through `decode.ts` → `events.ts` → `source.ts`). pre-migration rows backfill to the zero-hash sentinel; since `(tx_hash, log_index)` was already unique, the constant sentinel preserves their uniqueness, so a historical `block_number → block_hash` RPC backfill is optional cosmetic cleanup, not a correctness requirement.

### gap #20 resolution — predicted-address mismatch warn log + metric

gap #20 (from `packages/contracts-evm/AUDIT/USER_FLOW_COVERAGE.md`): `handlePortalTokenCreated` would silently return `null` when the portal-emitted token address did not match any stored `predictedTokenAddress`. router-level `PredictedAddressMismatch` already protects funds, but the indexer dropped the only visible observation event.

**FIXED in wave J:** `apps/launch-indexer/src/handlers/flap.ts` now warn-logs `"portal TokenCreated has no matching predicted address (gap #20)"` with `{token, creator, nonce, name, symbol, txHash, blockNumber}` AND bumps the `indexer_portal_token_created_unmatched_total` counter on every mismatch. symmetric coverage added for the `LaunchedToDEX` orphan path (`indexer_flap_launched_to_dex_unmatched_total`). unit tests pin the behavior.

### gap F16 — TreasuryLP4 events were never indexed (waifufun#599)

the indexer covered LaunchFactory, LaunchVault, BundleRouter, the Flap portal, and Flap graduation, but **nothing** from `TreasuryLP4` — the contract that owns post-launch LP, buybacks, and fee distribution. the #599 issue assumed event names that do not exist on the deployed contract; the real events live in `packages/contracts-evm/contracts/TreasuryLP4.sol` (events block).

**status: SHIPPED (waifufun#599).** indexed 11 lifecycle/value events — `TierEpochAdvanced`, `TierEpochsReset`, `TierDeployed`, `TierPaused`, `V3PoolInitialized`, `BuybackExecuted`, `BnbClaimed`, `TokenFeesClaimed`, `BuybackBpsSet`, `EpochLengthSet`, `FlapV2PairSet`. `OraclePoked` is deliberately excluded as high-frequency TWAP telemetry with no per-launch lifecycle meaning.

**implementation:** new `treasuryLpEventsAbi` (added to `allLaunchEventAbis`, which auto-extends the getLogs topic filter); per-event types + decode cases (`events.ts`, `decode.ts`); new `treasuryLpCursorId` + poller Phase 3 that polls each launch's `treasury_lp_address` with its own cursor (bootstrapped from the non-zero `treasuryLp` on `LaunchCreated`); discriminated `treasury_lp_events` table (migration `0039_broken_puck.sql`) keyed on `(tx_hash, log_index, block_hash)` per #601, with `event_kind` discriminator, full decoded args in `payload` jsonb, and promoted `tier_idx` / `agent_safe_address` columns for filtering; dispatcher `handlers/treasury-lp.ts`. unit tests cover decode round-trips (indexed + non-indexed + bool variants) and the dispatcher's discriminator/promotion logic.

## fix summary

- 4 P0 gaps fixed inline (ABI sync + new handlers + idempotency, wave I).
- 1 P1 gap fixed inline (stuck-launch detector, wave I).
- P1 auto-refund cron: FIXED in wave J (`tier-cron/refund-cron.ts`, feature-flagged).
- P2 wallet-pool stuck-lock detection: FIXED in wave J (`tier-cron/wallet-pool-health.ts`).
- P2 portal handler tests: FIXED in wave J (`launch-indexer/handlers/flap.test.ts`).
- P2 `block_hash` unique key: SHIPPED (waifufun#601) — migration `0038_condemned_mercury.sql` + handler/event wiring.
- gap #20 (silent no-op on predicted-addr mismatch): FIXED in wave J (warn log + counter).
- gap F16 (TreasuryLP4 events unindexed): SHIPPED (waifufun#599) — `treasuryLpEventsAbi` + decode/events wiring + poller Phase 3 + `treasury_lp_events` table (migration `0039_broken_puck.sql`).

29/29 launch-indexer tests pass. 16/16 tier-cron tests pass. schema migrations: `0038_condemned_mercury.sql` (block_hash dedupe, #601), `0039_broken_puck.sql` (treasury_lp_events, #599).
