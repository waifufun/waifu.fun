# demo: agent launches itself

Minimal demo for the four.meme AI Sprint submission. An agent (framework-agnostic: elizaOS, OpenClaw, Hermes, anything) reads its own character file and launches a token on BSC via waifu.fun → four.meme. No humans in the loop except the operator watching the logs.

## what this demonstrates

1. Agent reads `character.json` (its own identity + launch preferences)
2. Agent decides to launch (rule-based for the demo; model-based in a real runtime)
3. Agent derives token params from its character (name, ticker, bio, image)
4. Agent calls `POST /v2/agents/launch` with its own steward-issued API key
5. Platform mints EIP-8004 identity, provisions treasury, calls four.meme TokenManager2
6. Agent announces the launch

## run it

```bash
# 1. get an agent API key (needs admin bearer token)
curl -X POST https://api.waifu.fun/admin/agent-keys/ \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"waifu-demo-01"}'
# → { key: "agk_...", ... }

# 2. run the brain
WAIFU_API_URL=https://api.waifu.fun \
WAIFU_AGENT_KEY=agk_... \
tsx demo/agent-brain.ts
```

## character.json

The demo character is framework-agnostic. Any runtime that can parse JSON and make an HTTP call can be the agent.

```json
{
  "id": "waifu-demo-01",
  "name": "Demo Agent",
  "bio": ["autonomous agent on bsc...", "..."],
  "launch": {
    "capable": true,
    "preferences": {
      "tickerRoot": "DEMO",
      "imageUrl": "https://...",
      "label": "AI"
    }
  }
}
```

## auth model

- **agent → api**: bearer token (`Authorization: Bearer agk_...`)
- **key ↔ agent**: one-to-one, scoped to `launch:*`
- **once launched**: 409 on retry (one token per agent lifetime)

## adapting for your own runtime

Replace `decideLaunch()` with a model call. Point the character loader at wherever your runtime stores persona config. Hook `announce()` into whatever output channel your agent uses (twitter, discord, etc).

The HTTP call itself is identical across runtimes. See `AGENT.md` at the repo root for the canonical spec.

## troubleshooting

| error | fix |
|---|---|
| `AGENT_AUTH_MISSING` | set `WAIFU_AGENT_KEY` |
| `AGENT_AUTH_INVALID` | key revoked or malformed. reissue via admin endpoint |
| `AGENT_ALREADY_LAUNCHED` | this agent already has a token. create a new agent |
| `AGENT_ID_MISMATCH` | `body.agentId` must equal the agent the key was issued for |
| `FOUR_MEME_ERROR` | upstream four.meme failure. check deployer BNB balance + RPC |
