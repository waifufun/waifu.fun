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

**followup (P1):** wire a separate `refundCronAction` that, when a launch is stuck >12h AND `bundleStatus in (pending, failed_retry)` AND under-subscribed (totalDeposited < presaleCap), simulates + sends `enableRefundUnderSubscribed`. tracked separately because it touches signer auth + needs a feature flag for prod.

### P2 — wallet pool stuck-lock detection

`bundle_wallet_pool.next_available_ts` can stay in the past forever if `releaseWallet` is never called and the cooldown is bumped on each attempt. there's no alert if a wallet has been locked > N minutes.

**followup (P2):** add a metric / health check in tier-cron or a dedicated wallet-pool-health cron that warns when `next_available_ts > now() + 5*BUNDLE_WALLET_COOLDOWN_SECONDS`.

### P2 — partial test coverage on Flap Portal handlers

`handlePortalTokenCreated` / `handleFlapLaunchedToDex` are exercised end-to-end by `poller.test.ts`'s round-trip flow but lack standalone unit tests asserting field-by-field DB writes. low risk (small handlers, simple shape) but worth filling in.

**followup (P2):** add handler-level tests mirroring the new vault handler test pattern.

### P2 — reorg / restart-from-snapshot safety is shallow

current strategy: every handler is keyed on `(tx_hash, log_index)` for inserts, and the launch row is unique on `tokenAddress`. that's enough to survive a clean replay, but a real reorg where the same `(tx_hash, log_index)` reappears at a different block number would slip through because we don't store `block_hash`. low priority on bsc post-3-block-finality (we use `confirmations >= 3`) but worth noting.

**followup (P2):** add `block_hash` to the unique key once `confirmations` is brought down or a different chain is supported.

## fix summary

- 4 P0 gaps fixed inline (ABI sync + new handlers + idempotency).
- 1 P1 gap fixed inline (stuck-launch detector).
- 3 followups filed (auto-refund tx, wallet-pool lock alerts, block_hash key).

15/15 launch-indexer tests pass. 16/16 tier-cron tests pass. no contract changes, no new dependencies, no schema migrations needed (every column already exists on `agent_launches`).
