# waifu.fun Master Plan — Token Detail Evolution (Mar 13)

## Objective
Move the token detail page from a mostly trading-shaped surface into a true agent product surface without sacrificing market truth.

## Product Thesis
A waifu token page should answer two different user intents:
1. **Can I trust and trade this thing?**
2. **What is this agent, what is it doing, and how is it performing?**

Right now intent #1 dominates the page shape. The next pass should make both intents first-class, with the **agent view becoming the product-defining default** and the **trading view becoming a dedicated market mode**.

## Locked Constraints
- Keep truth-over-polish discipline.
- Do not regress live market integrity fixes.
- Do not make the page feel like a DexScreener clone.
- Homepage remains locked except for minor polish.
- Flap remains the launch rail.
- Frontend is Next.js App Router.
- Use `waifufun.vercel.app` or direct Vercel artifacts for validation until custom domain routing is clean.

---

## Region 1 — Market Surface Truth

### Problems
- Trades table still reads too market-primary.
- `counter amount` is technically correct but unclear.
- Price context per trade is missing or too implicit.
- External live trades and historical/backfill rows need one calmer, consistent language model.

### Goals
- Make every trade row immediately understandable.
- Add **price** context without making the section louder.
- Rename or reframe `counter amount` to human language.
- Preserve honest source labeling for portal vs backfill vs external market rows.

### Proposed UI changes
- Replace `counter amount` with **"paid / received"** or **"quote value"** depending on row type.
- Add a compact **price** column using unit price when derivable.
- Use row copy by semantic action:
  - Buy: `received` token amount, `paid` quote amount, `price`
  - Sell: `sold` token amount, `received` quote amount, `price`
- Keep historical/external status in a subdued pill or subtitle, not repeated noise.
- For stale rows, show `price unavailable` rather than inventing one.

### Backend/API follow-ups
- Ensure trade payload can expose a reliable unit price when source supports it.
- Keep source metadata structured, not stringly.
- Preserve fallback behavior when quote precision is uncertain.

### Definition of done
- A new user can understand a row in under 2 seconds.
- No fake quote values.
- Price is visible when honest, absent when not.

---

## Region 2 — Dual Detail Experience: Agent View + Trading View

### Problems
- The page still feels like a trading page with agent panels attached.
- Chart and trades dominate the emotional center.
- Agent identity, runtime, treasury, socials, and output are not given enough room.

### Goals
- Split the page into two clear modes:
  1. **Agent view**: default, narrative + operational + social
  2. **Trading view**: chart, swap, market activity, liquidity context
- Use the same underlying data, but different hierarchy.

### Proposed structure
#### Default: Agent View
Top band:
- Agent identity
- lifecycle state
- linked handler / socials
- quick reputation signals

Main grid:
- **Agent status card**: runtime state, cloud status, uptime, last action
- **Treasury card**: balances, runway, reserve allocation, deployer-controlled wallets
- **Activity card**: recent agent actions, latest trades, recent social output
- **Market snapshot card**: price, mcap, 24h volume, holders state, external liquidity state

Lower section:
- tabs for `activity`, `treasury`, `positions`, `social`, `holders`, `ops`

#### Secondary: Trading View
Top band:
- price, change, liquidity, chart controls

Main grid:
- chart
- swap / trade actions
- trade history drawer
- external market links

### Interaction model
- Use a prominent two-mode segmented control near the top:
  - `agent`
  - `market`
- Persist selection in query param or local state.
- Public users land on `agent` by default for waifu-native differentiation.
- Power users can switch to `market` instantly.

### Definition of done
- The page no longer reads as a pump.fun clone.
- Agent view can stand on its own even if trading is temporarily thin.
- Trading view still satisfies power users.

---

## Region 3 — Operator Surface: Treasury, Runtime, and Performance

### Problems
- Current operator panels are better, but fragmented.
- Treasury is implied more than actually modeled.
- There is no clean operator summary showing what the agent owns, spends, earns, and controls.

### Goals
- Turn the right-side operator experience into a real control plane.
- Show owner-only depth without breaking public readability.
- Define the backend contract for treasury and runtime metrics.

### Proposed operator modules
- **Treasury overview**
  - token balance
  - quote/native balance
  - runway estimate
  - reserve split
  - last funding event
- **Execution health**
  - runtime status
  - current model
  - env / region / node
  - last successful heartbeat
  - last failure
- **Agent performance**
  - realized/unrealized P&L if supported
  - recent trade cadence
  - social cadence
  - conversion or engagement metrics later
- **Controls**
  - start/stop/restart
  - model switch
  - budget guardrails
  - autopost / autopilot toggles

### Backend follow-ups
- Define what treasury data comes from waifu-core vs cloud runtime vs chain reads.
- Add explicit treasury contract if missing.
- Avoid guessing balances from partial sources.
- Start with read-only truthful cards before adding controls.

### Definition of done
- Owners can answer `what does my agent currently control and how healthy is it?` from one surface.
- Public users see a clean read-only summary, not broken controls.

---

## Region 4 — Identity & Social Linking

### Problems
- Linked handler / account identity is underdeveloped.
- We need a clean way to bind a Twitter/X account or operator identity to the agent.
- Current stack may benefit from Privy instead of custom account-linking glue.

### Goals
- Evaluate **Privy** as the canonical identity/linking layer.
- Support creator auth + wallet auth + optional social linking.
- Show verified linked handler on the token/agent page.

### Investigation questions
- Can Privy link wallet + Twitter/X on the same user cleanly for our creator flow?
- Can we use Privy as the source of truth for linked social accounts and verified ownership?
- What data do we want to display publicly:
  - handler
  - avatar
  - verification state
  - post-permission state
- How does this interact with waifu-core service JWT auth and cloud provisioning?

### Proposed public UI
- `linked handler` block in the top identity section
- verified badge only when we actually have proof of control
- recent posts or posting status later, not phase 1

### Proposed owner flow
- claim token/agent
- link wallet
- link Twitter/X via Privy
- optionally grant posting permission / automation scope
- reflect linked status back into waifu-core token-agent model

### Definition of done
- A creator can prove `this is my handler` without bespoke auth spaghetti.
- Public page can display linked identity confidently.

---

## Immediate Execution Plan

### Pass A — Small truth fixes
1. Rework trade table labels
2. Add honest price column where derivable
3. Calm source labeling further
4. Re-test Milady + Eliza live external trade behavior

### Pass B — UX architecture
1. Design and implement `agent` vs `market` mode split
2. Recompose token detail information hierarchy
3. Keep chart/trades in market mode, not as the page identity

### Pass C — Operator contract pass
1. Audit available treasury/runtime fields in waifu-core + cloud
2. Define minimal read-only operator summary contract
3. Implement truthful placeholders where data is not yet available

### Pass D — Identity/linking pass
1. Research Privy capabilities and integration shape
2. Decide ownership model for linked handler
3. Add backend/frontend integration plan before UI polish

---

## Worker Assignment Plan
- **GPT-5.4 lane A**: trade table semantics, price column, naming cleanup, low-risk tactical fix list
- **GPT-5.4 lane B**: treasury/runtime/backend contract audit across waifu.fun, waifu-core, eliza-cloud
- **Opus 4.6 lane A**: high-level information architecture for agent-vs-market split
- **Opus 4.6 lane B**: identity/social linking vision, Privy fit, public/owner UX

## Consolidation Output Required
Each lane must return:
1. findings
2. concrete file targets
3. risks
4. recommended implementation order
5. what can ship now vs later

## Main Session Deliverable
After worker synthesis, produce one consolidated build plan with:
- exact UI changes
- exact backend contract changes
- exact sequencing
- which items are safe for immediate implementation
- which items need product decision from Shadow
