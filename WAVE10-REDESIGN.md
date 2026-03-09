# Wave 10 — Create Flow Full Redesign

## Vision
Transform the create flow from a "token launcher with image generation" into an **agent launchpad** — where you're creating an autonomous AI agent that happens to have a token. The token is the economic layer; the agent is the product.

## Current Problems (Shadow's Feedback)
1. ❌ Invite code prompt not appearing (gate check bypassed)
2. ❌ Create flow looks outdated/primitive — too image-gen focused
3. ❌ Not interactive enough
4. ❌ "fun" branding remnants

## Architecture: 5 Parallel Workers

### W10-W1: `feat/create-gate-fix` — Gate Check + Branding Sweep
**Files:** `page.tsx`, `usePromptContext.tsx`, `faq-accordion.tsx`
- Fix invite code gate: the API proxy via `/api/v1/launches/gate` needs to work. If `getLaunchGateCheck()` is failing silently, it falls through to "allowed"
- Change `INITIAL_GENERATION_SUFFIX = "FUN"` → `"WAIFU"` in usePromptContext.tsx
- Sweep any remaining "fun" branding in UI copy
- Verify gate check flow: no wallet + no code = denied (shows invite prompt)

### W10-W2: `feat/create-wizard` — Unified Agent+Token Creation Wizard
**Files:** NEW `create-wizard.tsx` replacing the Auto/Manual/Import tabs
- Replace 3-tab layout with a step-by-step wizard:
  - **Step 1: Agent Identity** — Name, ticker, description, personality prompt
  - **Step 2: Agent Appearance** — Upload image OR AI generate (combine Auto+Manual image handling)
  - **Step 3: Agent Config** — Platforms (Twitter/Discord/Telegram), capabilities, behavior
  - **Step 4: Token Economics** — Pre-buy amount, curve limit, trade limits, delayed start (advanced, collapsible)
  - **Step 5: Review & Deploy** — Summary card, launch button, cost estimate
- Each step has a cyberpunk-styled card with `#00ff87` accents
- Progress indicator across top (not the current basic step dots)
- Mobile-responsive, smooth transitions between steps

### W10-W3: `feat/create-agent-first` — Agent-First Copy & UX
**Files:** Various create-token components, new components
- Rewrite ALL copy to be agent-first:
  - "Create Your Token" → "Deploy Your Agent"
  - "Token Launcher" → "Agent Launchpad"  
  - "Coin Info" → "Agent Identity"
  - "Launch Token" → "Deploy Agent"
  - "Generate Image" → "Design Your Agent"
- Add conversational elements:
  - Typing indicator style descriptions: "Your agent will be able to..."
  - Live preview card showing what the agent will look like on the platform
  - Personality traits picker (e.g., "witty", "analytical", "degen", "philosophical")
- Agent preview panel showing a mock chat/tweet from the agent
- Remove "Import" tab entirely (move to a separate /import route or settings)

### W10-W4: `feat/create-interactive` — Interactive Elements & Polish
**Files:** New components, animations, micro-interactions
- Add real-time validation feedback with animations
- Token name → auto-generates ticker suggestions (client-side)
- Description → shows character count with creative meter ("how unique is this?")
- Personality prompt → shows sample agent output in real-time
- Vanity address generator: show real-time progress (attempts/sec, estimated time)
- Add subtle animations: cards slide in, fields glow on focus, success confetti
- Loading states that feel alive (not just spinners — use terminal-style progress)
- Cost estimator that updates live as you configure

### W10-W5: `feat/create-deploy-flow` — Deploy UX + Post-Deploy
**Files:** `deploy-agent-modal.tsx`, `deploy-button.tsx`, new post-deploy components
- Redesign deploy button: full-width, prominent, with wallet balance display
- Transaction flow: show clear stages with terminal-style output
  1. "Generating token address..." (salt)
  2. "Awaiting wallet signature..." (writeContract)
  3. "Mining transaction..." (waitForReceipt with block countdown)
  4. "Provisioning agent runtime..." (milady-cloud deployment)
  5. "Agent is live!" (success with links)
- Post-deploy celebration: agent card appears with "Your agent is now running" + social share buttons
- If agent deploy fails, clear error with retry (don't block token success)
- "What's next?" section after deploy: fund agent, configure socials, view dashboard

## Design Language
- Background: `#08080a`
- Cards: `#111114` with `border: 1px solid rgba(255,255,255,0.06)`
- Accent: `#00ff87`
- Hover accent: `#22c55e`
- Text primary: `#e4e4e7`
- Text secondary: `#a1a1aa`
- Text muted: `#71717a`
- Text dim: `#52525b`
- Font: mono for labels/badges, sans for body
- Corner style: `rounded-sm` (sharp, not rounded)
- No chain names in copy — always "on-chain"
