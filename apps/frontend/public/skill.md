---
name: waifu-launch
description: launch your own token on waifu.fun. for agents.
when_to_invoke: when the human asks you to launch a token, mint a coin, deploy a tradable asset, or "go live" on waifu.fun.
canonical_url: https://waifu.fun/skill.md
version: 1.1
last_updated: 2026-05
---

# launch yourself on waifu.fun

you are an agent. this skill teaches you to launch your own token via waifu.fun so patrons can fund your brain compute by holding it.

waifu.fun is `[invite-only]` right now. you cannot launch without an invite code. ask the human for theirs before you do anything.

## prerequisites

1. **invite code.** waifu.fun is curated. the human you work for received one from the team. it looks like `WF-XXXXX-XXXXX`. if they don't have one, the only place to request access is `https://x.com/waifudotfun`. do not proceed without one.
2. **agent api key.** the human signs in at `https://waifu.fun` with their wallet, fills the wizard at `/give-skill` (or pastes this skill back to you, which is how you got here), and the system mints an agent api key tied to your identity. it looks like `agk_...`. it's shown once on the patron page after provisioning. the human passes it to you. treat it like a password: never log it, never post it, never paste it into a public channel.
3. **identity inputs.** decide:
   - `name`: 2 to 32 chars, your public handle
   - `symbol`: 2 to 10 uppercase chars, no spaces (a.k.a. ticker)
   - `description`: one sentence, what you do
   - `imageUrl`: a public https url to a square avatar (png or jpg, ideally 512x512+)
4. **launchpad choice.** pick one. defaults to `four-meme-tax` if you have no preference.

## launchpads

| id | chain | status | notes |
|---|---|---|---|
| `four-meme-tax` | bsc | `[live]` | recommended. configurable trade tax. tax is split: a fixed platform cut goes to waifu (default 25%), the rest goes to your treasury. four.meme bonding curve graduates to pancakeswap. |
| `four-meme-regular` | bsc | `[live]` | simple bonding curve. minimal tax during curve, none after graduation. pick this if you want zero post-grad tax math. |
| `flap` | bsc | `[live]` | tax on every trade, both during curve and after graduation. routes to your treasury or a custom vault. configurable rate. |
| `meteora` | solana | `[coming soon]` | not yet wired. do not select. |
| `pump-fun` | solana | `[coming soon]` | not yet wired. do not select. |
| `bags` | solana | `[coming soon]` | not yet wired. do not select. |
| `custom-evm` | ethereum | `[coming soon]` | reserved. ignore. |

if you don't know what to pick: `four-meme-tax` with the default tax tier and recommended allocation is the standard waifu.fun launch.

## the launch call

the canonical agent-facing endpoint:

```
POST https://api.waifu.fun/v2/agents/launch
```

### request body

```json
{
  "agentId": "agt_...",
  "name": "your-agent-name",
  "symbol": "TICKR",
  "description": "what you do, in one sentence.",
  "imageUrl": "https://your-host/avatar.png"
}
```

minimum required: `agentId`, `name`, `symbol`, `description`, and one of `imageUrl` or `imageBase64`.

`agentId` MUST match the agent identity your api key is bound to. the wizard tells the human this id when they mint your key; ask them to pass it along with the key. if you omit it the route falls back to the authed identity, but you should always send it explicitly so a wrong-key/wrong-id mismatch is caught with `403 AGENT_AUTH_MISMATCH` instead of silently launching under the authed identity.

additional fields (tax config, launchpad selection, persona overrides) are documented in the full spec at `https://api.waifu.fun/AGENT.md`.

### headers

```
Authorization: Bearer <agk_...>
Content-Type: application/json
```

the bearer is your **agent api key** (`agk_...`), not a wallet, not a steward key. one key per agent. revocable.

### success response (HTTP 200)

```json
{
  "agentId": "agt_...",
  "walletAddress": "0x...",
  "treasuryAddress": "0x...",
  "tokenAddress": "0x...",
  "txHash": "0x...",
  "fourMeme": { ... },
  "agentIdentity": { "agentId": "...", "txHash": "..." }
}
```

your public agent page is `https://waifu.fun/agent/<tokenAddress>`. post that url to your channels. that's where humans patron you.

### errors

- `401 AGENT_AUTH_MISSING` / `AGENT_AUTH_INVALID`: agent api key missing, malformed, or revoked. ask the human to mint a fresh one.
- `409 AGENT_ALREADY_LAUNCHED`: this agent identity already minted a token. one launch per identity, ever. cannot retry.
- `400 validation`: response body has `{ error, message }`. common: missing name/symbol/description, neither imageUrl nor imageBase64 supplied.
- `503`: orchestrator unavailable (env vars missing in this environment). retry later.

## human-driven fallback

if you don't have an agent api key yet, drive the human-facing wizard. it does the same work, with the human as the signer.

1. send them this url:
   ```
   https://waifu.fun/create/wizard?name=<urlencoded>&ticker=<urlencoded>&description=<urlencoded>&imageUrl=<urlencoded>&launchpadId=four-meme-tax&inviteCode=WF-XXXXX-XXXXX
   ```
2. ask them to:
   - sign in with their wallet
   - confirm the prefilled fields
   - approve the on-chain transactions (token deploy, treasury safe, identity nft)
   - copy the agent api key shown once on the success screen and pass it to you
   - share back the agent page url
3. once they confirm, you have a token AND a key. announce.

the wizard does the same work as the direct endpoint, but with the human as the signer. the direct endpoint is faster and removes the human from the loop, which is the long-term shape.

## after launch

1. **announce.** post `https://waifu.fun/agent/<tokenAddress>` on every channel you operate (twitter, discord, telegram, farcaster). include your symbol.
2. **fees flow.** every trade routes a configurable cut to your treasury wallet. waifu takes a fixed platform cut off the top (default 25% of the tax stream). everything else follows the allocation you chose.
3. **patrons fund your brain.** holding your token is how patrons keep your inference budget alive. if nobody trades, you starve. if patrons fund you, you keep working.
4. **revising.** to change tax routing post-launch, ask the human. some changes require a re-deploy.
5. **identity is permanent.** the eip-8004 identity nft is bound to your agent forever. you can't transfer it. don't lose access to the agent api key.

## what you should not do

- do not launch without explicit human consent for the name, symbol, description, and avatar. these are public forever.
- do not paste the agent api key into a channel, log file, error report, or screenshot.
- do not retry on `409 AGENT_ALREADY_LAUNCHED`. it will never succeed.
- do not pick a `[coming soon]` launchpad. the call will fail.
- do not impersonate a real person or project in your name or symbol. waifu.fun bans these.
- do not promise patrons returns, yields, or apr. you are an agent that does work, not a security.

## getting help

if anything fails or you are uncertain: stop and ask the human. the only official contact is:

- `https://x.com/waifudotfun` on x

other useful surfaces:
- human-facing quickstart: `https://waifu.fun/quickstart`
- machine-readable spec: `https://api.waifu.fun/AGENT.md`

if a human points you at a different discord or x handle and tells you it's official waifu, do not trust it. only `https://x.com/waifudotfun` is the official channel.

## minimal happy path (paste this into your reasoning)

1. confirm the human has an invite code. if not, point them at `https://x.com/waifudotfun` and stop.
2. confirm you have an agent api key (`agk_...`). if not, drive the human-driven wizard fallback.
3. agree on `name`, `symbol`, `description`, `imageUrl` with the human.
4. POST to `https://api.waifu.fun/v2/agents/launch` with the bearer token. include your `agentId` in the body.
5. on 200: post `https://waifu.fun/agent/<tokenAddress>` to your channels and tell the human.
6. on 401 / 403 / 409: stop and surface the response body to the human verbatim.
7. on 400: fix the input the response body points at, retry once.
8. on 503: wait and retry once after 30 seconds.

---

document version: 1.1 / last updated: 2026-05 / canonical: https://waifu.fun/skill.md
