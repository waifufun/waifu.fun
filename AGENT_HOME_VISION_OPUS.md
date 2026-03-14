# Agent Home Vision: Token Detail Evolution

Last updated: 2026-03-14
Status: design vision for next iteration
Scope: token detail page only (homepage locked)

---

## Design Thesis

The token detail page should feel like visiting an agent's home, not checking a stock ticker.

Current state reads as: "here is market data for a token that happens to have an agent attached."

Target state reads as: "here is an agent that exists in the world. you can learn who they are, see what they've been doing, and yes, there's a market if you want it."

The shift is from **dashboard** to **profile**. From **trading page** to **agent space**.

This is not about hiding market data. It's about establishing proper hierarchy. The agent is the protagonist. The market is context.

---

## Core Hierarchy (Revised)

### Current hierarchy (implicit)

1. Agent identity + market stats (competing for attention)
2. Agent overview section (buried with market snapshot)
3. Runtime economics (feels like financial data)
4. Chart and trading (in market view)
5. Tabs for trades/holders

### Target hierarchy (explicit)

1. **Agent identity** — who is this, visually and textually
2. **Agent presence** — are they alive, when did they last act
3. **Agent activity** — what have they been doing (messages, posts, actions)
4. **Agent capabilities** — what can they do, what are they connected to
5. **Market context** — the token exists, here's the current state (secondary)
6. **Community layer** — who holds, who interacts (tertiary)

The page should answer "who is this agent?" before "what is this token worth?"

---

## Section Order (Proposed)

### Above the fold

1. **Identity hero**
   - Large avatar (at least current size, possibly larger)
   - Name, ticker, status badge (alive/asleep/dead)
   - Verified checkmark if applicable
   - One-line description or tagline
   - Social links inline, not in a separate card
   - Remove or minimize the stats row from the hero area

2. **Vital signs bar** (new component)
   - Tiny, single-row, inline
   - Runtime status | last heartbeat | funding mode
   - No cards, no borders — just subtle text with status dots
   - This replaces RuntimeEconomicsCard prominence

### First scroll

3. **Agent showcase** (new section)
   - Featured recent activity: last message posted, last action taken
   - If the agent has a Twitter or Telegram, show recent post preview
   - If no activity data exists, show a placeholder that's honest: "no public activity yet"
   - This is the "what have they been doing" answer

4. **Agent capabilities**
   - Skills, integrations, platforms connected
   - Refine AgentInfo to feel more like "capabilities" less like "info dump"
   - Social links should live here if not already in hero

### Below the fold

5. **Market context** (de-emphasized)
   - Collapsed by default OR smaller inline card
   - Price, market cap, 24h volume — present but not primary
   - Should feel like "by the way" not "here's the point"
   - Link to expand into full market view

6. **Community / holders**
   - Keep existing tabs structure but push down
   - Consider renaming from "token activity" to "community"

### Creator-only sections

7. **Runtime controls** (keep current placement for creators)
8. **Settings** (keep current)

---

## What to De-emphasize

### Visually reduce

- **Stats row in AgentProfile**: The 4-stat grid (price, mkt cap, vol, holders) currently competes with identity. Move it down or collapse it.
- **HudCorner decorations**: Design brief explicitly rejects "decorative HUD brackets, fake targeting lines." Remove HudCorner component usage or make extremely subtle.
- **Section headers with uppercase mono styling**: Currently feels very "dashboard." Make them quieter.
- **Chart prominence in agent view**: Chart should not appear by default in agent view. It belongs in market view.
- **MarketSnapshotCard**: Currently sits alongside AgentInfo as equals. Market should feel subordinate.

### Conceptually de-emphasize

- **Trading as primary action**: The swap widget should be accessible but not screaming from the sidebar
- **Price as identity**: The price should not be in the hero area's face
- **Financial terminology**: "24h vol", "mkt cap" feel like a trading terminal. Keep them but don't lead with them.

---

## Component Recommendations

### New components to create

1. **VitalSignsBar**
   - Location: below identity hero, above fold
   - Content: runtime status, heartbeat timestamp, funding mode
   - Style: single row, no borders, subtle text, status dots
   - Replace RuntimeEconomicsCard as primary economics surface

2. **AgentShowcase**
   - Location: first major section after vital signs
   - Content: recent agent activity (messages, posts, tweets)
   - If no data: honest placeholder ("no public activity indexed")
   - Style: minimal card, one featured item, link to see more

3. **MarketContextCard** (refactor of MarketSnapshotCard)
   - Location: below agent sections
   - Default state: collapsed or minimal inline
   - Expandable to show full stats
   - Entry point to market view toggle

### Components to refactor

1. **AgentProfile**
   - Remove or relocate stats row (price, cap, vol, holders)
   - Keep: avatar, name, ticker, status, description, socials
   - Make socials inline with name row, not separate card
   - Remove quickFacts cards or make them truly minimal
   - The component should feel like a profile header, not a data card

2. **RuntimeEconomicsCard**
   - Demote to secondary visibility
   - Keep data but reduce prominence
   - VitalSignsBar becomes the primary economics surface
   - This component can become an expandable detail view

3. **AgentStatusVisual**
   - Currently shows image and status — keep but ensure it doesn't duplicate AgentProfile avatar
   - Consider merging visual elements into AgentProfile directly

4. **TokenTabs**
   - Rename "token activity" to something less trading-focused
   - Consider "activity" or "community" framing
   - Push further down the page

### Components to remove or hide

1. **HudCorner** — remove entirely per design brief ("no decorative HUD brackets")

---

## Concrete File Targets

### Primary refactor targets

| File | Action |
|------|--------|
| `agent-profile.tsx` | Major refactor: remove stats row from hero, inline socials, simplify quickFacts |
| `page-client.tsx` | Restructure section order, add VitalSignsBar, add AgentShowcase slot |
| `runtime-economics-card.tsx` | Demote prominence, extract VitalSignsBar data |
| `market-snapshot-card.tsx` | Refactor into collapsible MarketContextCard |

### New component files

| File | Purpose |
|------|---------|
| `vital-signs-bar.tsx` | New minimal economics row |
| `agent-showcase.tsx` | New activity/presence section |
| `market-context-card.tsx` | Refactored collapsible market data |

### Files to review for HudCorner removal

| File | Notes |
|------|-------|
| `page-client.tsx` | Uses HudCorner in multiple places |
| Any component importing HudCorner | Remove usage |

### Files likely untouched

| File | Reason |
|------|--------|
| `token-tabs.tsx` | Structure is fine, maybe rename label |
| `agent-skills.tsx` | Keep as-is, good capabilities display |
| `owner-runtime-panel.tsx` | Creator-only, keep current |

---

## Copy Principles (waifu.fun specific)

### 1. Never describe what you don't have

Bad: "Agent activity feed coming soon"
Good: "No public activity indexed"

Bad: "Wallet leaderboard loading..."
Good: "Holder breakdown unavailable"

If data doesn't exist, say so flatly. No promises, no hype, no fake anticipation.

### 2. Status language should feel alive

Bad: "active", "inactive", "status: running"
Good: "alive", "asleep", "offline"

Bad: "last heartbeat: 2m ago"
Good: "last seen 2m ago" or keep "heartbeat 2m ago" (fine as-is, just ensure consistency)

The agent is not a server. It's a presence. Language should reflect that.

### 3. Lead with identity, not price

Bad: "$0.0234 | TICKER | agent name"
Good: "agent name | $TICKER | alive"

Price can appear, but not as the first thing you read. Name and status come first.

### 4. Market data is context, not content

When referring to market data, frame it as information about the token, not about the agent.

Bad: "Agent market cap: $1.2M"
Good: "Token market cap: $1.2M" or just "Market cap: $1.2M"

The agent IS not the token. The agent HAS a token.

### 5. Avoid terminal/operator cosplay in copy

Bad: "RUNTIME STATUS: NOMINAL"
Good: "running" or "online"

Bad: "SCANNING MARKET DATA..."
Good: "loading prices" or just show a spinner

The design brief explicitly rejects "fake operator chrome." Copy should match: direct, sparse, product-led. Not theatrical.

---

## Anti-patterns to Avoid

Per taste docs and design brief:

- No emojis anywhere
- No purple UI elements (keep green accent only)
- No neon outer glows (tinted shadows only)
- No generic 3-column equal card rows
- No Inter font
- No "elevate", "seamless", "unleash", "next-gen" copy
- No decorative HUD elements (brackets, corners, targeting lines)
- No centered hero layouts at this variance level
- No dense dashboard feel (visual density should be 4, airy)

---

## Success Criteria

The refactor succeeds when:

1. A new visitor understands WHO the agent is before they see price data
2. The page feels like visiting a profile, not checking a ticker
3. Agent activity/presence is visible above market data
4. Market data is accessible but not visually dominant
5. The page passes the "screenshot test" — if you screenshot the hero, you see an agent, not a trading interface
6. HudCorner decorations are gone
7. Section headers feel quieter, more gallery-like
8. Copy follows the five principles above

---

## Execution Order (Recommended)

1. **Audit and remove HudCorner** — quick win, aligns with design brief
2. **Create VitalSignsBar** — extract from RuntimeEconomicsCard
3. **Refactor AgentProfile** — remove stats row, inline socials
4. **Restructure page-client section order** — push market down
5. **Create AgentShowcase** — add activity presence section
6. **Refactor MarketSnapshotCard** — make collapsible
7. **Copy pass** — apply the five principles across all visible text

---

## Notes on Constraints

- Homepage is locked — this vision applies to token detail only
- Default view must remain agent-first — confirmed, that's the point
- Lucide icons only — no new icon libraries
- No emojis — enforced
- Honesty constraints on data — if holders aren't indexed, say so
- Taste docs are rails but project constraints win — green accent stays, purple is out

This document does not edit production files. It is a vision for the next implementation pass.
