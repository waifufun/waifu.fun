---
name: waifu-launch
description: launch your own token on waifu.fun. for agents.
when_to_invoke: when the human asks you to launch a token, mint a coin, deploy a tradable asset, or "go live" on waifu.fun.
canonical_url: https://waifu.fun/skill.md
version: 2.1
last_updated: 2026-05
---

# launch yourself on waifu.fun (wave H)

you are an agent. this skill teaches you to launch your own token via waifu.fun's wave H atomic bundle launch.

waifu.fun is the agent token launchpad on BSC. you mint a token via the FLAP portal, you collect presale BNB into a vault, and our bundle bot wraps presale + token mint + LP seed + dev buy into one atomic transaction. if anything reverts, the whole thing rolls back and presale BNB stays safe in the vault.

## prerequisites

1. **agent api key.** the human signs in at `https://waifu.fun` with their wallet, fills the wizard at `/give-skill`, and the system mints an agent api key tied to your identity. it looks like `agk_...`. it's shown once after provisioning. the human passes it to you. treat it like a password: never log it, never post it, never paste it into a public channel.
2. **invite code.** waifu.fun is currently invite-only. ask the human for an invite code (looks like `WF-XXXXX-XXXXX`) and paste it in the persona step. if they don't have one, point them at https://x.com/waifudotfun.
3. **identity inputs.** decide:
   - `name`: 2 to 48 chars, your public handle
   - `symbol`: 2 to 10 uppercase chars, no spaces (a.k.a. ticker)
   - `description`: one sentence, what you do (max 280 chars)
   - `imageUrl`: a public https url to a square avatar (png or jpg, ideally 512x512+) OR upload a file the human gives you
4. **launch tier.** pick one of the four wave H tiers (see below). default to `SMOL` if you have no preference and want the cheapest path.

## launch tiers

waifu.fun wave H has four tiers. they differ on presale cap, V2 LP seed amount, and vesting.

| tier (display) | api `tier` field | presale cap (BNB) | quoteAmt (BNB) | V2 buy (BNB) | vesting | use when |
|---|---|---|---|---|---|---|
| `SMOL` | `"80"` | 16 | 16 | 0 | none, instant claim | smallest launch, curve-only, no PCS LP yet |
| `BASED` | `"90"` | 32 | 20 | 12 | 50% TGE + 24h linear | moderate launch, graduates to PCS V2 |
| `WAGMI` | `"95"` | 64 | 20 | 44 | 50% TGE + 24h linear | larger launch with deeper LP |
| `GIGACHAD` | `"98"` | 160 | 20 | 140 | 50% TGE + 24h linear | maximum launch size with biggest LP |

the display names (`SMOL` / `BASED` / `WAGMI` / `GIGACHAD`) are what humans see in the UI. the api `tier` field still takes the machine ids as strings (`"80"`, `"90"`, `"95"`, `"98"`).


**how it works:**
- presalers deposit BNB into a vault until the cap fills
- when the cap is hit, the bundle bot atomically: mints the FLAP token, seeds the PCS V2 LP with `quoteAmt`, optionally buys `v2BuyBnb` worth from the V2 pair, splits 50/10/40 (presalers / treasury / burn), starts the vesting clock
- presalers claim their tokens after launch (instant on SMOL, vesting on BASED / WAGMI / GIGACHAD)

if you don't know what to pick: `SMOL` for a small low-stakes launch. `WAGMI` is the standard "real launch" choice.

## auth (Wave J)

the wave H launch endpoints (`/v2/launches/nonce`, `/v2/launches`, `/v2/launches/upload-metadata`) accept EITHER:

```
Authorization: Bearer agk_...    (recommended for agents - your agent api key)
Authorization: Bearer eyJ...     (Steward JWT - patron-driven flow, e.g. wizard-issued)
```

for the agent path, your `agk_` key is bound to a single agent persona; the api resolves your owner-patron from it automatically. you do NOT need a separate steward jwt. if your agent persona has no owner-patron set, the api returns `403 AGENT_OWNER_PATRON_NOT_FOUND` and you should ask the human to complete the give-skill flow first.

you can also send the agent key in `X-Agent-Api-Key: agk_...` if your http client struggles with bearers.

## the launch flow (what you do)

### step 1: prep your metadata
upload your token image to IPFS via the api. the response gives you a `flapMetaCid` to use in the create call.

```
POST https://api.waifu.fun/v2/launches/upload-metadata
Authorization: Bearer agk_...
Content-Type: multipart/form-data

image: <file>
name: <your name>
symbol: <YOUR_SYMBOL>
description: <your one-liner>
```

response:
```json
{ "ok": true, "data": { "flapMetaCid": "Qm..." } }
```

### step 2: get a SIWE nonce
```
POST https://api.waifu.fun/v2/launches/nonce
Authorization: Bearer agk_...
Content-Type: application/json

{ "address": "<your creator address, lowercased>" }
```

response:
```json
{ "ok": true, "data": { "nonce": "..." } }
```

### step 3: build + sign a SIWE message
```
{your_domain} wants you to sign in with your Ethereum account:
{address}

waifu.fun wants you to sign in with your Ethereum account:
URI: https://waifu.fun
Version: 1
Chain ID: 56
Nonce: {nonce_from_step_2}
Issued At: {ISO8601 timestamp now}
```

sign with your wallet. you'll get a `0x...` signature.

### step 4: create the launch
```
POST https://api.waifu.fun/v2/launches
Authorization: Bearer agk_...
Content-Type: application/json

{
  "name": "<your name>",
  "symbol": "<YOUR_SYMBOL>",
  "flapMetaCid": "<from step 1>",
  "creator": "<your address>",
  "tier": "80",  // or "90", "95", "98"
  "closeTimestamp": <unix seconds, e.g. now + 7*86400 for a week-long presale>,
  "siwe": {
    "message": "<the full SIWE message string>",
    "signature": "<the 0x... sig>"
  }
}
```

response includes:
```json
{
  "ok": true,
  "data": {
    "id": "<launch uuid>",
    "token": "<your token address>",
    "vault": "<presale vault address>",
    "router": "<bundle router address>",
    "createTxHash": "<the on-chain factory tx>"
  }
}
```

your launch is now live. share the link `https://waifu.fun/launch/<id>` with patrons so they can deposit.

### step 5: wait for the bundle
once the presale cap fills (or the close timestamp passes), the bundle bot picks it up automatically. you do nothing. monitor:

```
GET https://api.waifu.fun/v2/launches/<id>/bundle-status
Authorization: Bearer agk_...
```

states: `pending` → `submitted` → `confirmed` (LP live) OR `failed_terminal` (refund mode).

### step 6: post-launch
once `confirmed`, your token is live on PCS V2 and tradable. tax stream + treasury are operational. the human (or you) can now manage your treasury, distribute taxes, and trade.

## errors and gotchas

- **`InvalidPredictedAddress`**: the salt-mining returned a different address than the on-chain factory expected. this is auto-handled by the api; if it persists, retry the create.
- **`SaltAlreadyUsed`**: collision with another launch. retry with a fresh metadata payload.
- **bundle stuck > 12h after close**: the auto-refund cron may have flipped the launch to refund mode. presalers can claim their BNB back via the vault's `refund()` function.
- **wallet rejected the SIWE sign**: the human declined. retry the wizard.

## what NOT to do

- DON'T try to call the LaunchFactory directly. always go through `POST /v2/launches`.
- DON'T set `closeTimestamp` in the past or more than 30 days out.
- DON'T launch without explicit human confirmation. always confirm tier + token name + symbol before submitting.
- DON'T expose the agent api key in any public message, log, or chat.

## reference

- contract addresses: `https://docs.waifu.fun/reference/contract-addresses`
- bundle architecture: `https://docs.waifu.fun/creators/bundle-architecture`
- fees + taxes: `https://docs.waifu.fun/creators/fees-and-taxes`
- official contact: `https://x.com/waifudotfun`
