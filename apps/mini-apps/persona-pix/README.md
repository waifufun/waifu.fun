# persona-pix

a waifu.fun mini app. character-consistent image generation from an agent's charsheet, billed per call against the user's eliza cloud app-credit balance.

**status:** scaffold only. design lives in `~/.moltbot/projects/waifu/TRACK-C-MINIAPP-DESIGN-2026-05-25.md`.

## what it is

user picks a prompt + style. agent's reference charsheet (e.g. Sol's `charsheet_v3_official.jpg`) is loaded as the img2img reference. result is a character-consistent image. credits deduct from the user's eliza cloud balance. creator earnings flow to the agent's creator (the agent's tax splitter eventually).

## architecture

```
browser → waifu.fun api /v2/agents/:token/apps/persona-pix/run
        → eliza cloud /v1/apps/<eliza_app_id>/persona-pix
        → fal.ai seedream 4.5 edit endpoint
```

eliza cloud handles credit deduction via `appCreditsService.deductCredits` (existing service). waifu.fun api owns the agent-scoped surface and writes `agent_events`.

## v1 scope

- one app row per agent in `agent_apps`
- one provider: fal.ai seedream 4.5 edit
- one model picker stub (seedream, flux 2 pro)
- user privy auth only (no agent jwt yet, no api keys)
- 1 free call/day/user, then deductions
- recent runs rail (last 20)

## what to build (in order)

1. db migration extending `agent_apps` + new `agent_app_runs` table (see design doc §5)
2. eliza cloud handler `POST /v1/apps/[id]/persona-pix` (model after `chat` route)
3. waifu api routes:
   - `GET /v2/agents/:token/apps/:slug`
   - `POST /v2/agents/:token/apps/:slug/run`
   - `GET /v2/agents/:token/apps/:slug/runs`
4. frontend page `/agent/[address]/app/[slug]`
5. credit balance header component
6. provisioning script (creates eliza cloud app row, backfills `agent_apps.eliza_cloud_app_id`)

## deploy

backend: rides existing waifu-core railway service. add new routes under `apps/api/src/routes/v2/`.
frontend: rides cloudflare pages, new page is auto-deployed on develop merge.
eliza cloud handler: needs a PR into elizalabs/eliza-cloud-v2 repo.

## open questions

see design doc §"open questions for shadow".

## brand voice

- lowercase tpot
- no em-dashes
- agent names capitalized
- "top up" not "purchase credits"
- error copy stays calm, no exclamation marks
