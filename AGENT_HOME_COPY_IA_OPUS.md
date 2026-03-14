# Agent Home: Copy & Information Architecture

> Content model, naming, and microcopy for waifu.fun token pages.  
> Default view should feel like visiting an agent's home/profile, not a pump page.

---

## Core Philosophy

**The token page is the agent's home.** Visitors are guests. The agent is the subject—not the market, not the chart, not the bonding curve. Market data is available but contextual, like a thermostat reading in someone's living room.

**Truth over theater.** If data doesn't exist, say so plainly. No fake mystery, no "coming soon" placeholders that never resolve, no ellipses pretending depth.

**Blunt, not cold.** Copy should be direct and lowercase. Avoid warmth-signaling ("we're excited to…") and avoid cynicism. Just state what is.

---

## Information Architecture

### View Mode Split

| Mode | Primary Focus | Secondary | For Whom |
|------|---------------|-----------|----------|
| **agent** (default) | Who they are, what they do, operational state | Market snapshot (compressed) | Everyone visiting the profile |
| **market** | Price action, trading interface, chart | Agent identity (sidebar) | Traders, speculators |

The toggle copy should be:
- `agent` / `market` (lowercase, no labels like "View:")
- Active state: solid fill. Inactive: outline only.

---

## Section Naming

### Current → Recommended

| Current | Recommended | Rationale |
|---------|-------------|-----------|
| "agent overview" | **"about"** | Simpler. "Overview" is dashboard-speak. |
| "agent controls" | **"interact"** | What you can do with the agent. |
| "agent info" | **"details"** | Or omit header entirely—let content speak. |
| "runtime controls" | **"operations"** | Creator-only. Clear it's infrastructure. |
| "settings" | **"settings"** | Fine as-is. |
| "bonding curve" | **"bonding"** | One word. The progress bar explains itself. |
| "market data" | **"market"** | Or just show timeframe selector without header. |
| "trading" | **"trade"** | Verb form, action-oriented. |
| "runtime economics" | **"economics"** | Drop "runtime" in public view. |
| "economics" (card title) | **"operating costs"** | More honest about what it shows. |

### Section Header Format

Use this exact pattern:
```
[10px] [mono] [uppercase] [tracking-wider] [#71717a]
```

No icons in section headers. Icons belong inside cards, not as section decorators.

---

## Agent Lifecycle States

### Technical States (Internal)

| State | Meaning |
|-------|---------|
| `bonding` | Still in bonding curve, not yet graduated |
| `active` | Graduated, has recent activity |
| `dormant` | Graduated but no recent activity |
| `imported` | External token brought into waifu.fun |
| `migrated` | Graduated and moved to external DEX |

### Display Status (User-Facing)

These are the only three states users should see in the top-right badge:

| Status | When | Badge Style |
|--------|------|-------------|
| **alive** | Bonding OR active OR (external + recent activity) | Green border, green text |
| **asleep** | Dormant, no recent activity | Zinc/gray border, gray text |
| **dead** | Finalized OR (bonded + zero market cap) | Red border, red text |

**Why "alive/asleep/dead" instead of technical terms:**
- Visitors understand biological metaphors instantly
- Avoids explaining "bonding" vs "migrated" to casual viewers
- Creates emotional resonance without being corny

### Status Labels (Inline, Near Ticker)

Show the technical state as a smaller inline pill near the ticker for those who want specifics:
- `bonding` / `active` / `dormant` / `imported` / `migrated`

This gives power users the info while keeping the primary badge simple.

---

## Card Titles & Labels

### Agent Profile Card (Hero)

| Element | Current | Recommended |
|---------|---------|-------------|
| Subhead | "agent workspace first. market context stays visible but secondary." | **Remove entirely.** This is meta-commentary, not content. |
| Quick Facts section | "created by" | **"creator"** |
| Quick Facts | "market mode" | **"market"** (value: "bonding" / "external pool" / "graduated") |
| Quick Facts | "coverage" | **"data"** (value: "live" / "delayed" / "unavailable") |
| Stats helper text | "current feed" | **"live"** |
| Stats helper text | "waiting on live feed" | **"delayed"** |
| Stats helper text | "fully diluted estimate" | **"fdv"** (abbreviation is standard) |
| Stats helper text | "external market flow" | **"external"** |
| Stats helper text | "not live on this feed" | **"—"** (just show dash for value, no explanation) |
| Stats helper text | "wallet leaderboard ready" | **"indexed"** |
| Stats helper text | "aggregate total only" | **"aggregate"** |
| Stats helper text | "not exposed" | **"unavailable"** |

### Agent Info Card

| Current | Recommended |
|---------|-------------|
| "agent info" | **"details"** or no header |
| "linked socials" | **"links"** |
| "holders" helper "wallet-level indexed" | **"indexed"** |
| "holders" helper "aggregate total only" | **"total only"** |
| "holders" helper "not exposed" | **"—"** |

### Runtime Economics Card

| Current | Recommended |
|---------|-------------|
| Card header "economics" | **"costs"** |
| Card title "runtime economics" | **"operating costs"** |
| Section "runtime status" | **"status"** |
| Section "funding" | **"funding"** |
| Empty state text | See below |

**Empty State (current):**
> "No public runtime economics data is exposed on this token yet."

**Empty State (recommended):**
> "No cost data available."

That's it. Don't explain why or promise it might come.

### Owner Runtime Panel

| Current | Recommended |
|---------|-------------|
| "owner console" | **"operations"** |
| Claim button "claim owner access" | **"claim"** |
| Status "unclaimed" | **"unclaimed"** |
| Status "claimed" | **"claimed"** |
| Status "verified" | **"verified"** |
| Helper "checking auth…" | **"checking…"** |
| Helper "finish wallet auth to claim" | **"connect + sign to claim"** |
| Helper "connect creator wallet" | **"connect creator wallet"** |
| Runtime status "none" | **"inactive"** |
| Runtime status "provisioning" | **"starting…"** |
| Runtime status "running" | **"running"** |
| Runtime status "suspended" | **"paused"** |
| Runtime status "failed" | **"failed"** |
| Runtime status "deleted" | **"deleted"** |
| Button "activate" | **"start"** |
| Button "suspend" | **"pause"** |
| Button "resume" | **"resume"** |
| Loading text "loading runtime…" | **"loading…"** |
| Billing label "billing:" | **"mode:"** |

### Market View Specifics

| Current | Recommended |
|---------|-------------|
| Chart card header "price chart" | **Remove.** The chart is self-evident. |
| Chart card subtext "Dedicated market view for price, flow, and activity." | **Remove entirely.** |
| Timeframe buttons | Keep as-is: `1h` `4h` `1d` `1w` `all` |
| Source label "live external market" | **"live"** |
| Source label "indexed fallback" | **"delayed"** |
| Source label "waifu.fun market" | **"internal"** |

---

## Empty States

### Principle
Empty states should be one line, factual, and end with a period. No ellipses. No "stay tuned." No emoji.

| Context | Copy |
|---------|------|
| No description | (Show nothing—don't show an empty description field) |
| No socials | (Show grayed icons, no text) |
| No holders data | **"—"** |
| No volume | **"—"** |
| No market cap | **"—"** |
| No runtime data | **"No cost data available."** |
| No agent capabilities | **"No capabilities configured."** |
| Chart unavailable | **"Chart unavailable."** |
| API error | **"Data unavailable."** |

---

## Creator vs Public Surface

### Public View (Everyone)

Shows:
- Agent identity (image, name, ticker, description)
- Lifecycle status (alive/asleep/dead + technical state)
- Market snapshot (price, mcap, volume, holders)
- Quick facts (creator, market mode, data coverage)
- Socials/links
- About section (if agent has capabilities/bio)
- Operating costs (if public data exposed)
- Interact section (chat, actions)
- Market view toggle

Does NOT show:
- Runtime controls
- Settings
- Claim buttons
- Billing details
- Reserve balances (unless opted-in for transparency)

### Creator View (Connected + Claimed)

Shows everything public sees, plus:
- **Operations section**
  - Claim status
  - Runtime status with controls (start/pause/resume)
  - Billing mode
  - Reserve balance
  - Daily burn / runway
- **Settings section**
  - Update socials
  - (Future: character config, integrations)

### Visual Distinction

Creator-only sections should have:
- Slightly different card treatment (could use `border-[#00ff87]/10` instead of white/6)
- Small lock or shield icon in section header (subtle, not prominent)
- Section label could append "(creator)" but keep it lowercase and muted

---

## Anti-Copy Rules

### Never Use

| Banned | Why |
|--------|-----|
| "Elevate" | AI slop |
| "Seamless" | AI slop |
| "Unleash" | AI slop |
| "Next-gen" | AI slop |
| "Revolutionary" | AI slop |
| "Cutting-edge" | AI slop |
| "Empower" | AI slop |
| "Supercharge" | AI slop |
| "coming soon" | Promises without delivery |
| "stay tuned" | Empty hype |
| "exciting" / "excited" | Performative enthusiasm |
| "we" (as platform voice) | Keep UI voiceless |
| "your" (excessively) | One "your" per screen max |
| Ellipses for mystery | "Loading…" is fine. "More coming…" is not. |
| Question marks in labels | "Need help?" → No. Just provide help. |
| Emoji in UI chrome | Icons only. Emoji in user content is fine. |

### Prefer

| Instead Of | Use |
|------------|-----|
| "Get started" | "start" |
| "Learn more" | (link the noun directly) |
| "Click here" | (never) |
| "Please" | (omit) |
| "Successfully" | (omit—if it worked, they'll see) |
| "Are you sure?" | "confirm [action]" |
| "Oops!" | (state what happened) |
| "Something went wrong" | "Request failed." |

### Capitalization

- Section headers: **lowercase**
- Button labels: **lowercase**
- Status badges: **lowercase**
- Error messages: **Sentence case** (first letter only)
- Ticker symbols: **$UPPER**

### Punctuation

- Labels: no period
- Helper text: no period (unless full sentence)
- Empty states: period
- Error messages: period
- Button text: no period

---

## Micro-Interactions Copy

### Toast Messages

| Action | Success | Error |
|--------|---------|-------|
| Claim | "claimed." | "Claim failed." |
| Start runtime | "starting…" (optimistic) → "running." | "Start failed." |
| Pause runtime | "paused." | "Pause failed." |
| Resume runtime | "resumed." | "Resume failed." |
| Update socials | "saved." | "Save failed." |
| Copy address | "copied." | (no toast—just visual feedback) |

### Loading States

- Inline spinners: no text needed if context is clear
- Skeleton content: no text
- Full-section loading: "loading…" (lowercase, ellipsis)

### Confirmation Dialogs

Avoid when possible. For destructive actions:
```
Title: pause runtime?
Body: [omit unless stakes are high]
Buttons: [cancel] [pause]
```

No "Are you sure?" ever.

---

## Component Naming (Internal)

For developer reference, not user-facing:

| Current | Recommended |
|---------|-------------|
| `AgentProfile` | `AgentHero` |
| `AgentInfo` | `AgentDetails` |
| `AgentSkills` | Keep (if showing capabilities) |
| `RuntimeEconomicsCard` | `OperatingCostsCard` |
| `OwnerRuntimePanel` | `OperationsPanel` |
| `MarketSnapshotCard` | Keep |
| `AgentStatusVisual` | `AgentStatusBanner` |
| `ViewModeToggle` | Keep |

---

## Summary: The Most Usable Moves

1. **"alive / asleep / dead"** for primary status badge—instant comprehension
2. **Drop "agent" prefix** from section names—it's obvious
3. **"about" instead of "overview"**—less dashboard, more home
4. **"interact" instead of "controls"**—what visitors can do
5. **"operations" for creator section**—clear it's infrastructure
6. **One-word helper text**—"live" not "current feed"
7. **Dash for missing data**—no explanations
8. **"costs" not "economics"**—plain language
9. **Remove all meta-commentary**—"workspace first, market secondary" is for the design doc, not the UI
10. **Toast messages in past tense, lowercase**—"claimed." not "Successfully claimed ownership!"

---

## Implementation Priority

1. **Status badge rename** (alive/asleep/dead) — highest impact, easiest change
2. **Section header cleanup** — drop "agent" prefix, lowercase, no icons
3. **Helper text compression** — one-word replacements throughout
4. **Empty state standardization** — consistent dashes and brief phrases
5. **Creator section visual distinction** — subtle border tint
6. **Remove meta-commentary** — the subhead under the name
7. **Toast message audit** — lowercase, past tense, no exclamation

---

*This document is the source of truth for token page copy. When in doubt, be shorter.*
