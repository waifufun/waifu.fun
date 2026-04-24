# W4.1 — Frontend Honesty Audit

Scope: `apps/frontend`. Goal: remove mock data, fake counters, invented
personality, hardcoded economics numbers that don't reflect reality, and
claims about features we don't ship. Replace with real API data where the
backend supports it, or with brand-consistent "coming soon" / empty states.

Brand: dark only, `#00ff87` accent, JetBrains Mono + Space Grotesk, sharp
corners. Voice: TPOT lowercase, short declarative, no em-dashes.

## 1. Offenses

Everything below is present on `develop` before this PR. Rows are
`file:line · what's fake · fix`.

### 1.1 MOCK / fake data

| file:line                              | what's fake                                       | fix                                                                    |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/mock-api.ts:1-7`              | whole file exists to read from `mock-tokens.json` | delete file. no consumers once search is fixed.                        |
| `src/data/mock-tokens.json`            | empty `[]`, dead asset that still leaks in build  | delete.                                                                |
| `src/components/search-menu.tsx:4,17`  | search powered by empty mock array → always "no results" | rewrite search to say "coming soon" (no public search endpoint yet). |
| `src/stories/RecentTransactionItem.stories.tsx:8`       | storybook-only mock transaction                    | leave. storybook is internal, not production.                           |
| `src/lib/utils.ts:352`                 | comment: "Return a fake transaction hash"         | behaviour is fine (returns sentinel on DEX redirect). just drop the word "fake" in the comment. |

### 1.2 Invented personality / fake brain strings

| file:line                              | what's fake                                       | fix                                                                    |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/components/agent-home/agent-home.tsx:172` | `brain: {agent.framework \|\| "ElizaOS"} + {agent.model \|\| "Cloud"}` fabricates a brain string when backend omits it | only render the brain row when both `framework` and `model` are present. never invent. |
| `src/components/agents-discover/agent-card.tsx:51` | `{agent.framework \|\| "ElizaOS"}` same lie, smaller surface | only render if `agent.framework` exists, else show `—`. |
| `src/components/agent-home/types.ts:22-23` comments | "e.g. `ElizaOS`", "e.g. `Cloud`" — lingering suggestion that every agent is Eliza | keep type, remove misleading example comment. |
| `src/components/agent-home/agent-voice.tsx:25-26` | "twitter timeline embeds coming soon" — this is honest, leave it | no change. tone matches. |

### 1.3 Dead Fleek / legacy Eliza import flow

| file:line                              | what's fake                                       | fix                                                                    |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/components/connect-fleek.tsx`     | "Import Fleek Agent" CTA wired to a POST that's not part of the v2 launch flow | delete. no consumers; `token-page/agents.tsx` is also dead. |
| `src/components/fleek-agent.tsx`       | renders `IAgent[]` from a flow we don't ship      | delete.                                                                 |
| `src/components/token-page/agents.tsx` | imports the two above; not imported anywhere       | delete.                                                                 |
| `src/locales/*.json` `connectFleek.*`  | 11 keys for the dead flow                         | delete.                                                                 |

### 1.4 Litepaper + quickstart hardcoded claims

These pages make specific promises about infra. Everything here is either
actually built today, roadmap, or outright fabricated. The spec says: "only
show what's real."

| file:line                              | claim                                              | status / fix                                                          |
| -------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/litepaper/hero-v2.tsx:37-38` | "ElizaOS native … built on ElizaOS and Eliza Cloud. production-grade agent infrastructure, not a wrapper." | not true in v1. agents are framework-agnostic; no ElizaOS integration is shipped. rewrite as "framework-agnostic: any runtime that can make an HTTP request." |
| `src/components/litepaper/the-stack-v2.tsx:36`  | "any runtime that can make an authenticated HTTP request works: ElizaOS, OpenClaw, Hermes" | accurate tone. keep but drop the branded list from the heading; keep as example. |
| `src/components/litepaper/the-stack-v2.tsx:42-43`    | "eliza cloud, claude, gpt, llama" as pluggable inference options | accurate, generic. keep. |
| `src/components/litepaper/the-stack-v2.tsx:105`      | "powered by" pills: `ElizaOS, Eliza Cloud, Steward, BSC native` | only Steward + BSC are real today. replace with `Steward, BSC, four.meme, PancakeSwap`. |
| `src/components/litepaper/the-fix-v2.tsx:32-33`      | "ElizaOS + Eliza Cloud — production agent runtime with managed hosting. deploy once, scale automatically. cloud handles inference." | fabricated. rewrite: agent wallet + treasury via Steward, BSC launch, hosting is the dev's problem. |
| `src/components/litepaper/the-fix-v2.tsx:77`         | "waifu.fun is the economic layer for agents built on ElizaOS. Eliza Cloud handles hosting." | same lie. rewrite as "waifu.fun is the economic layer for autonomous agents on BSC. you bring the runtime. we handle identity, treasury, token, fees." |
| `src/components/litepaper/economics-v2.tsx:61-98` tier cards | "fine-tuned model. personality in the weights…" for `pro`/`ultra`/`sovereign` | these are `roadmap` and already labelled. leave (the labelling is honest), but reword "we don\'t promise what we haven\'t built" (escaped quote typo → fix). |
| `src/components/litepaper/specialization.tsx:47-51`, `61-66` | prediction-market agents, content agents, research agents, fine-tuning agents — described as existing | reframe as "what agents can do on this infra" rather than "platform features we ship." tone down certainty, mark as ecosystem examples. |
| `src/components/litepaper/closing-v2.tsx:113-116`    | footer links `four.meme / elizaOS / Eliza Cloud / Steward` | Eliza Cloud isn't a dependency. replace the two Eliza rows with `pancakeswap`. |
| `src/components/litepaper/the-stack.tsx` (unused, 169 lines) | talks about Milady Cloud, ElizaOS, dedicated VPS, fine-tuning | file is not imported. dead. delete this entire cohort. |
| `src/components/litepaper/{architecture,closing,different,economics,hero,moat,problem,stack,the-loop,tiers,trenches,vision}.tsx` | unused `v1` litepaper cohort — full of Milady/VPS/1M-points promises | none imported anywhere. delete all. the `v2` set is the live litepaper. |
| `src/components/footer.tsx:77` via `t("footer.miladyCloud")` → "milady cloud × eliza cloud" | footer pill asserts partnership with both | replace locale string with honest "open protocol on BSC". |
| `src/locales/en.json` → `footer.miladyCloud`, `hero.poweredBySubtitle`, `footer.poweredBy`, `story.*` block | 80+ keys about Milady Cloud, Eliza Cloud, dedicated VPS, `1M points distributed weekly` | rewrite the three in-use keys; delete the whole `story` block (page redirects to litepaper, no consumers). |
| `src/app/quickstart/page.tsx:167` | JSON example uses `"name": "Eliza"` as the agent name | rename to `"name": "my-agent"` — don't seed the Eliza brand. |
| `src/app/quickstart/page.tsx:40,121`  | "launch with Eliza" / "ElizaOS, OpenClaw, Hermes" | already framework-agnostic. fine. no change. |

### 1.5 TODO / FIXME markers

| file:line                              | comment                                       | fix                                                                    |
| -------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| `src/workers/generateVanity.ts:7`      | "TODO: Implement real CREATE2 salt brute-forcing" — worker returns fake vanity | leaves a lie in the worker. flag; full refactor out of scope. not user-visible today. |
| `src/components/landing/hero.tsx:228`  | "TODO(wave-1d-wave-1a-merge): partner rail"    | cosmetic. leave.                                                       |
| `src/components/profile-page/agents-tab.tsx:255` | "TODO(pivot-v2): create flow removed"          | leave.                                                                 |
| `src/components/ui/create-token/deploy-agent-modal.tsx:15` | "TODO(cleanup): remove along with …"          | leave.                                                                 |

### 1.6 Design system drift

| file:line / rule                         | drift                                              | fix                                                                   |
| ---------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| global: `#00ff87` vs `#22c55e` greens    | landing + litepaper use brand `#00ff87` (277 hits). agent-home, claim, token pages, empty states use Tailwind emerald `#22c55e` (84 hits). | standardise on `#00ff87`. replace `#22c55e` everywhere it's used as an accent. glitch-bg forest variants `#0f2a18 / #14532d / #86efac` stay (they are a gradient ramp, not the primary accent). |
| `src/components/steward/steward-login-widget.tsx:41` `rounded-xl` | brand uses sharp / `rounded-sm` | change to `rounded-sm`. |
| `src/components/ui/button.tsx`, `src/components/ui/badge.tsx` | contain `dark:*` tailwind variants; site is dark-only | leave — they're shadcn primitives used with our own theme layer, the `dark:` branches never activate. cleanup out of scope. |
| `src/components/fleek-agent.tsx:21` `rounded-md` on avatar | unused (file is deleted this PR) | gone with the file. |

## 2. What stays

- `src/stories/*` — Storybook is internal tooling, out of scope.
- `src/lib/utils.ts:352` — the "fake transaction hash" is a sentinel (`redirect_to_pancakeswap`) that the caller checks for to differentiate "we routed you to DEX" from "we executed a swap." the comment wording changes; the behaviour is correct.
- `grep 1_000_000` hits in formatters (`curve-progress`, `activity-strip`, `bonding-curve-progress`, etc.) — these are _number-format thresholds_ ("1.5m MCAP"), not hardcoded economics. honest.
- `lastActionAt` display: if the backend doesn't send it, we show "warming up", which is an honest empty state. keep.

## 3. Backend gaps flagged

These are places where the frontend would rather show real data but the API
doesn't expose what we need yet. None are fixed in this PR.

1. **Token / agent search.** No public search endpoint. `search-menu.tsx` now
   shows a "coming soon" state instead of searching a mock array.
2. **Per-agent patron count pre-auth.** `patron-panel.tsx` shows `0 patrons`
   until the patron endpoint responds; fine.
3. **Twitter timeline embeds.** `agent-voice.tsx` already says "timeline embeds
   coming soon." fine.
4. **Framework / model per agent.** Backend currently omits `framework` and
   `model` on most agents. Frontend no longer invents `ElizaOS + Cloud`.

## 4. Changes in this PR (summary)

- **Delete** the dead Fleek flow: `connect-fleek.tsx`, `fleek-agent.tsx`,
  `token-page/agents.tsx`, related locale keys.
- **Delete** the unused v1 litepaper cohort (13 files in
  `src/components/litepaper/`) and the unused `story.*` locale block.
- **Delete** `src/lib/mock-api.ts` and `src/data/mock-tokens.json`.
- **Rewrite** `search-menu.tsx` to render a brand-consistent "coming soon"
  state instead of searching mock data.
- **Stop inventing** `brain: ElizaOS + Cloud` in `agent-home.tsx` and
  `agent-card.tsx`. Render the row only when the backend provides both
  values. Same for `framework` fallback on cards.
- **Litepaper honesty pass**: rework `hero-v2.tsx`, `the-fix-v2.tsx`,
  `the-stack-v2.tsx`, `specialization.tsx`, `closing-v2.tsx` to stop
  claiming Eliza Cloud / ElizaOS as shipping infrastructure. The agent
  economy primitives are real. The runtime integration isn't.
- **Footer / hero copy**: drop "Milady Cloud × Eliza Cloud" footer pill and
  Milady Cloud subtitle. Replace with honest protocol framing.
- **Quickstart example**: rename `Eliza` → `my-agent` in the request body
  example. Don't seed the Eliza brand.
- **Design system**: replace accent `#22c55e` with `#00ff87` across user
  surfaces. Swap one `rounded-xl` on the steward login avatar for
  `rounded-sm`. No other visual refactor.

## 5. Not touched (intentionally out of scope)

- Create flow, claim flow, agent directory API shape, OAuth/X plumbing,
  profile pages, token-page legacy components.
- Backend. If a claim in this audit needs a data point the API doesn't
  expose, it became an empty state instead of a fabrication. No endpoints
  were added.
- Storybook stories.
- Pixel-perfect mobile, a11y audit, animation polish.
- The `#22c55e → #00ff87` swap was done on accent tokens (text, border, bg,
  shadow). Forest-green gradient ramps in `landing/hero.tsx`
  (`#0f2a18`, `#14532d`, `#86efac`) are preserved — they're a palette, not
  an accent.
