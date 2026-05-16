# waifu.fun staging walkthrough

> hand-test checklist for the wave H frontend before mainnet smoke. organized
> by user persona. each item is a click-test, not a unit test. assume staging
> is pointed at BSC testnet contracts (or mocked api during pre-deploy).

scope: every UI surface depositors and creators will hit on launch day.
ignore admin/ops surfaces (covered separately by the bundle-bot README + ops
runbook).

---

## creator flow

### C1. landing → create wizard
- [ ] homepage `/` loads, hero copy is current, no em-dashes
- [ ] `launch yours` CTA in agents empty state → routes to create wizard
- [ ] wizard renders behind auth gate; connect wallet flow works
- [ ] wizard tabs visible: persona → metadata → tier → review

### C2. persona step
- [ ] name + symbol + description required; submit disabled when empty
- [ ] symbol uppercase enforced + max 8 chars
- [ ] long description preserves linebreaks in preview

### C3. metadata step (IPFS upload)
- [ ] image upload triggers flap upload, shows progress
- [ ] returns CID, next button unlocks
- [ ] on upload failure: retry button appears, next stays disabled
- [ ] avatar preview renders

### C4. tier step
- [ ] all 4 tier cards render (80, 90, 95, 98)
- [ ] economics preview updates per tier
- [ ] tier 80 card: "presale → PCS curve" subtitle, no V2 LP mention
- [ ] tier 90/95/98: "presale → PCS V2 LP · 50/10/40 split · 24h vesting"
- [ ] selected tier highlights; can switch back and forth

### C5. review step
- [ ] all entered metadata + tier choice + economics summary visible
- [ ] gas + platform fee disclosed before signing
- [ ] submit triggers wagmi write to LaunchFactory.createLaunch
- [ ] on success: redirects to launch detail page
- [ ] on revert: error toast, wizard state preserved

---

## presaler flow

### P1. discovery (`/launches`)
- [ ] launches index renders cards for every backend state (draft, provisioned, open, queued, launching, live, failed)
- [ ] state pill matches backend status, doesn't bleed copy across cards
- [ ] tier badge per card matches actual launch tier
- [ ] BNB amounts use uppercase BNB
- [ ] empty state: dashed border + CTA, matches /agents siblings
- [ ] card click → launch detail page

### P2. launch detail , presale OPEN
- [ ] state banner: "presale is open, deposits + withdraws live"
- [ ] countdown timer ticks live, format flips: `2d 4h 17m` → `47m 23s` < 1h → `closed` when past
- [ ] presale progress bar shows totalDeposited / cap
- [ ] bonus pool overlay renders only when bonusPool > 0
- [ ] tier info card shows tier-specific path subtitle
- [ ] tier 80: v2 buy shows "n/a" with tooltip; vesting block hidden
- [ ] tier 90+: v2 buy shows BNB amount; vesting block visible
- [ ] FAQ accordion expands; copy is tier-aware
- [ ] deposit widget renders sticky desktop-top + mobile-bottom

### P3. deposit form
- [ ] wallet disconnected: "connect wallet" CTA gated
- [ ] wallet connected: form accessible
- [ ] quick-amount buttons (0.1, 0.5, 1, 5) populate input
- [ ] "max to cap" calculates remaining capacity correctly
- [ ] gas estimate displays via useEstimateFeesPerGas
- [ ] "you'll get ~X tokens" projection updates as amount changes
- [ ] amount > cap: button disabled or warning
- [ ] amount = 0: button disabled
- [ ] deposit submit triggers wagmi write; loading state visible
- [ ] success: balance updates, progress bar advances
- [ ] revert: error toast, form state preserved

### P4. launch detail , CLOSED (waiting for bundle)
- [ ] state banner: "waiting for bundle bot"
- [ ] deposit + withdraw both disabled with clear copy
- [ ] cap met indicator visible

### P5. launch detail , LAUNCHING
- [ ] state banner: "bundle bot working, ETA ~30s"
- [ ] countdown hides or flips to "bundle in flight"
- [ ] no interactive controls

### P6. launch detail , LAUNCHED
- [ ] state banner: "claim available"
- [ ] launch detail redirects to or shows post-launch surface
- [ ] tier 80 (no vest): claim button enabled, full balance claimable
- [ ] tier 90+ (vesting): claim widget shows TGE 50% + ETA to next unlock
- [ ] vesting timeline: live progress bar, claimable/claimed/locked stat row
- [ ] claim button triggers wagmi write
- [ ] success: balance updates, "last claim" tx hash links to BSCScan
- [ ] post-claim widget caption: "nothing claimed yet" / "partial" / "fully claimed"

### P7. launch detail , REFUND (under-subscribed OR bundle-failed)
- [ ] state banner: "this launch did not reach the cap" OR "bundle failed to execute"
- [ ] **refund widget renders** (gap #16 from wave I , PR #548)
- [ ] user's deposited BNB amount visible
- [ ] "refund X BNB" button enabled when amount > 0
- [ ] button disabled when amount = 0 ("nothing to refund")
- [ ] click triggers wagmi write LaunchVault.refund()
- [ ] success: "refunded" state with BSCScan tx link
- [ ] already refunded: shows refunded confirmation, button hidden

### P8. portfolio (`/portfolio`)
- [ ] empty state: "no positions yet" + CTA to /launches
- [ ] with positions: row per launch with name, state, deposited, claimable
- [ ] claim-all button visible when any row has claimable > 0
- [ ] claim-all triggers batch txs (or per-row claim)
- [ ] history table: shows past deposits, claims, refunds
- [ ] mobile: rows stack vertically, no horizontal scroll

---

## post-launch surface (after graduation)

### L1. token chart
- [ ] price + volume render
- [ ] time range selector works (1H, 24H, 7D, 30D, ALL)
- [ ] mobile: iframe height adapts (320 mobile / 420 sm+)

### L2. burn counter
- [ ] total burned + % of supply renders
- [ ] count-up animation on new burn events (poll every 10s)
- [ ] ARIA live region announces changes

### L3. tax stream stats
- [ ] live splitter balance visible
- [ ] 24h tax volume + lifetime tax distributed (or placeholder marker if indexer not wired yet)
- [ ] breakdown by destination: dividends, deflation, LP, market

### L4. trade activity feed
- [ ] rows for each trade: time, BNB amount, token amount, buyer/seller (truncated), tx hash
- [ ] buys green, sells red
- [ ] empty state: "no trades yet"
- [ ] tx hash → BSCScan

### L5. tier ladder
- [ ] shows which tier this token launched at
- [ ] responsive 2-col → 4-col grid

---

## cross-cutting

### X1. mobile (375px viewport)
- [ ] every public surface renders without horizontal scroll
- [ ] touch targets ≥44px
- [ ] sticky deposit widget at bottom on launch detail page
- [ ] header is present on every page

### X2. auth + wallet
- [ ] connect wallet flow works (rainbowkit modal)
- [ ] disconnect clears session
- [ ] switch wallet refreshes portfolio
- [ ] wrong network: prompts BSC switch
- [ ] SIWE sign for portfolio actions

### X3. dark mode
- [ ] every surface tested in dark mode
- [ ] contrast meets WCAG AA
- [ ] brand accent consistent

### X4. error states
- [ ] api 404: shows friendly error, retry CTA
- [ ] api 500: shows friendly error, retry CTA
- [ ] network drop: queries retry with backoff
- [ ] wallet rejection: toast, state preserved

### X5. copy + brand
- [ ] zero em-dashes across every surface (grep verified)
- [ ] WAIFU FLAP BNB BSC PCS IPFS USDC always CAPS
- [ ] waifu.fun, the bundle, the vault, the launch always lowercase
- [ ] TPOT lowercase voice throughout

---

## docs surfaces

### D1. docs.waifu.fun
- [ ] introduction page loads
- [ ] creators/quickstart end-to-end readable
- [ ] presalers/quickstart end-to-end readable
- [ ] vesting-explained page accurate vs contract
- [ ] refund-safety page accurate vs contract
- [ ] contract addresses page lists testnet (or mainnet) deploy addrs
- [ ] FAQ + glossary cross-link cleanly
- [ ] mermaid diagrams render
- [ ] no em-dashes (grep verified)

---

## known gaps (do NOT test, ship-as-is)

- gap #19: bundle-submitter doesn't auto-call `enableRefundBundleFailed` after attempt 3. Admin must call manually OR auto-refund cron will pick it up if `ENABLE_AUTO_REFUND_CRON=1`.

---

## sign-off

once every checkbox above is green on staging:
1. screenshot the launch detail in each of OPEN / CLOSED / LAUNCHED / REFUND states
2. confirm the bundle bot ran end-to-end on testnet (one full launch lifecycle)
3. green-light mainnet smoke launch (capped 1 BNB)
