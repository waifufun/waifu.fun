# agent-home

the agent detail page, component by component. dark only, `#00ff87`
primary accent, sharp corners, jetbrains mono for data, space grotesk
for display. lowercase voice.

## composition

```
agent-home.tsx              top-level layout
 ├─ agent header            name, ticker, description, traits, identity row
 ├─ patron-panel            patron count + "buy on four.meme" CTA
 ├─ v2 grid (2-col)
 │   ├─ treasury-card       bnb balance, token held, runway, last tax
 │   ├─ adapter-permissions read-only onchain capabilities
 │   ├─ x-embed             timeline or connect CTA
 │   └─ activity-feed       live agent event feed
 ├─ addresses               wallet · token · treasury (copy + bscscan)
 ├─ curve-progress          bonding-curve or "graduated" state
 ├─ dex-chart               tradingview-style chart post-graduation
 ├─ swap-stub               buy/sell stub that punches out to four.meme
 ├─ recent-activity         last 20 trades (from indexer)
 └─ system-prompt-reveal    progressive disclosure of the agent brain
```

## data contracts

each live component owns its own fetch. none of them block server
rendering of the page shell; everything is client-side so a 404 on any
single endpoint degrades that panel without affecting the rest.

| component             | endpoint                                       | status (w4.2)            | 404 behaviour                                                |
| --------------------- | ---------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| `activity-feed`       | `GET /v2/agents/:id/events?limit=25&cursor=…`  | ships in **w1.7**        | render `[ no activity yet ]` empty state, don't crash        |
| `treasury-card`       | `GET /v2/agents/:id/treasury`                  | ships in **w1.7**        | show `—` for missing fields, honest em-dash for runway       |
| `treasury-card`       | `GET /v2/agents/:id/events?eventType=tax.…`    | ships in **w1.7**        | last-tax line collapses to `—`                               |
| `treasury-card`       | wagmi/viem `useBalance` (onchain)              | live                     | `—` while loading or on rpc failure                          |
| `x-embed`             | `GET /v2/agents/:id/x`                         | ships in **w1.6**        | falls back to `twitterHandle` on the agent detail payload    |
| `x-embed` (cta)       | `POST /v2/agents/:id/x/oauth/start`            | ships in **w1.6**        | cta stays visible, click no-ops silently                     |
| `adapter-permissions` | `GET /v2/agents/:id/adapters`                  | not scheduled            | `[ adapters unavailable ]` empty state                       |

the invariant across every panel: **no invented data**. if the backend
doesn't ship a field, the ui shows `—` or an empty state, not a
plausible-looking number.

## types

`types.ts` defines the frontend-facing shapes. `AgentEvent` mirrors the
backend event feed schema (w1.7). when the shared `@waifufun/types`
package ships a single source of truth for events, delete the local copy
and import from there — until then we duplicate, which is documented in
the type's jsdoc.

## voice + style rules

- no emoji decoration
- no em-dashes in user-facing copy (ok in code comments)
- data in `font-mono`, prose in default (`space-grotesk` via layout)
- `rounded-sm` maximum (no pill-shaped anything)
- green `#00ff87` is the only chromatic accent; everything else is
  white/xx on `#08080a`
- status pulse only when the agent is live (`active` or "last action <
  recent")

## graceful-degrade contract (spec)

when adding a new panel that talks to an endpoint:

1. assume `404` or `501` means "not yet deployed" — render an empty
   state, not an error toast.
2. assume `5xx` / network error means "temporarily unavailable" — same
   empty state is fine; log to `console.error` for debug but don't
   surface a stack trace.
3. never fall back to fixtures. if the backend has no data, the ui has
   no data. this matches the w4.1 honesty pass.

## screenshots

before/after of the $demo agent page live in the w4.2 pr body. keep
them up to date when you touch this directory.
