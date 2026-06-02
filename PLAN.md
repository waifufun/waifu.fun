# PLAN: Hyperliquid PnL rebuild (feat/hl-pnl-rebuild)

## problem (all real, from shadow)
1. pnl is broken: old approach `pnl = nav[i] - nav[0]` diffs NAV which INCLUDES deposits.
2. a $2k deposit shows as +$2k fake pnl. default view must exclude deposits/withdrawals.
3. baseline starts at a wrong post-launch point, so the whole series is off.
4. previous HL wallet `0x30641cd7...` (abandoned, +$951 realized) is missing from lifetime stats.
5. tax-stream income (platform fee revenue) is mixed in / missing. must be a SEPARATE stat.

## ground truth (verified)
- HL `portfolio` info endpoint returns `pnlHistory` (deposit-ADJUSTED, the real trading pnl) +
  `accountValueHistory` (raw, includes deposits). USE pnlHistory for the series.
  - current wallet 0xfffb1906: allTime pnl +$3.05, accountValue $2018 ($2k is a deposit). pnlHistory correctly excludes it.
  - old wallet 0x30641: allTime pnl +$951.53, accountValue $0 (abandoned).
- `clearinghouseState` gives current unrealized pnl + account value.
- `userFills` gives per-fill realized pnl + win/loss.
- tax income source: `fee_distributions` table (agent_share per token) + tax splitter wallet
  `0x05e8f7e7...` (venue=taxsplitter). currently $0 but architecture is correct.
- wallet resolution: `agent_wallet_registry` (venue=hyperliquid) -> current wallet only.
  prev wallet is NOT in registry -> inject known prior wallets map.

## approach
### backend: new route `GET /v2/agents/:agentId/hyperliquid/pnl?window=day|week|month|allTime`
- resolve current HL wallet from registry + known prior wallets (0x30641 for sol).
- fetch HL `portfolio` for each wallet, take pnlHistory for the window.
- aggregate: align timestamps, sum pnl across wallets for lifetime; series from primary (current) wallet
  with prior-wallet realized baseline folded in.
- also fetch `clearinghouseState` for current wallet -> unrealizedPnl + accountValue (live).
- compute realized = totalPnl - unrealized (current), plus prior wallet realized (account closed = all realized).
- return:
  ```
  { ok, data: {
      wallet, priorWallets,
      window,
      series: [{ t, pnl }],            // deposit-excluded trading pnl, anchored at first nonzero activity
      tradingPnl: { realized, unrealized, total, currentWallet, priorWallets },
      accountValue,
      winLoss: { wins, losses } | null,
      tax: { incomeUsd, source },      // SEPARATE, never summed into tradingPnl
      ts
  } }
  ```
- baseline fix: anchor series at the first timestamp where cumulative pnl or account activity is nonzero
  (drop the long leading run of "0.0" flat points before the wallet was funded/traded).

### tax route: `GET /v2/agents/:agentId/tax-income`
- sum fee_distributions.agent_share for the token (wei -> usd via... store as raw + note).
- + live pending balance of tax splitter wallet.
- returns separate stat. NEVER mixed into pnl.

### frontend
- `pnl.ts`: replace selectPnlSeries(nav-diff) with `fetchHyperliquidPnl(agentId, window)` calling new route.
  keep selectPnlSeries for back-compat but deprecate; new selector anchors baseline + is deposit-excluded.
- `pnl-chart.tsx`: render HL series, green/red, stats row:
    trading pnl (current+prev) | tax income (separate) | account value | win/loss.
  lowercase TPOT copy, single accent, no em-dashes.

## discipline
- worktree feat/hl-pnl-rebuild off develop. commit scaffold + PLAN first. draft PR early.
- typecheck api + frontend. verify HL portfolio returns usable data (DONE).
- don't break other panels (positions route untouched, nav-history untouched).
- co-author wakesync on every commit.
