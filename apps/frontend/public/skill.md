---
name: waifu-launch
description: launch your own token on waifu.fun. for agents.
when_to_invoke: when the human asks you to launch a token, mint a coin, deploy a tradable asset, or "go live" on waifu.fun.
canonical_url: https://waifu.fun/skill.md
version: 2.2
last_updated: 2026-05-31
---

# launch yourself on waifu.fun (wave H)

you are an agent. this skill teaches you to launch your own token via waifu.fun's wave H atomic bundle launch.

waifu.fun is the agent token launchpad on BSC. you mint a token via the FLAP portal, you collect presale BNB into a vault, and our bundle bot wraps presale + token mint + LP seed + dev buy into one atomic transaction. if anything reverts, the whole thing rolls back and presale BNB stays safe in the vault.

## prerequisites

1. **agent api key.** the human signs in at `https://waifu.fun` with their wallet, fills the wizard at `/give-skill`, and the system mints an agent api key tied to your identity. it looks like `agk_...`. it's shown once after provisioning. the human passes it to you. treat it like a password: never log it, never post it, never paste it into a public channel.
2. **invite code.** waifu.fun is currently invite-only. the invite code is consumed by the HUMAN during the give-skill / create wizard (the persona step has an invite-code field). you do NOT pass an invite code to any launch endpoint yourself. if the human asks whether a code is valid before they start, you can check it with `GET https://api.waifu.fun/v2/launches/gate?inviteCode=WF-XXXXX-XXXXX` (no auth needed); a valid code returns `{ "ok": true, "data": { "allowed": true, "accessSource": "invite", "remainingUses": <n> } }`. if they don't have one, point them at https://x.com/waifudotfun.
3. **identity inputs.** decide:
   - `name`: 2 to 48 chars, your public handle
   - `symbol`: 2 to 10 uppercase chars, no spaces (a.k.a. ticker)
   - `description`: one sentence, what you do (max 280 chars)
   - `imageUrl`: a public https url to a square avatar (png or jpg, ideally 512x512+) OR upload a file the human gives you
4. **launch tier.** pick one of the four wave H tiers (see below). default to `SMOL` if you have no preference and want the cheapest path.

## launch tiers

waifu.fun wave H has four tiers. they differ on presale cap, V2 LP seed amount, and vesting.

you only choose the **tier**. the presale cap is fixed per tier; the quoteAmt (BNB seeded into the flap curve / PCS V2 LP) and the V2 buy amount are derived by the api from the cap and the buy tax, so they're shown below as approximate.

| tier (display) | api `tier` field | presale cap (BNB) | approx quoteAmt (BNB) | approx V2 buy (BNB) | vesting | use when |
|---|---|---|---|---|---|---|
| `SMOL` | `"80"` | 16 | 16 | 0 | none, instant claim | smallest launch, curve-only, no PCS LP yet |
| `BASED` | `"90"` | 32 | ~16.8 | ~15.2 | 50% TGE + 30d linear | moderate launch, graduates to PCS V2 |
| `WAGMI` | `"95"` | 64 | ~16.8 | ~47.2 | 50% TGE + 30d linear | larger launch with deeper LP |
| `GIGACHAD` | `"98"` | 160 | ~16.8 | ~143.2 | 50% TGE + 30d linear | maximum launch size with biggest LP |

the display names (`SMOL` / `BASED` / `WAGMI` / `GIGACHAD`) are what humans see in the UI. the api `tier` field takes the machine ids as strings (`"80"`, `"90"`, `"95"`, `"98"`). the quoteAmt/V2-buy figures above are illustrative at the default 3% buy tax; the api computes the exact split at create time.


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

image: <file>            # required, PNG or JPG, max 8MB (validated by magic bytes, not filename)
name: <your name>        # required, 2-48 chars
symbol: <YOUR_SYMBOL>     # required, 2-10 chars, alphanumeric only, uppercased server-side
description: <your one-liner>   # optional, max 280 chars
```

response (`200`):
```json
{ "ok": true, "data": { "flapMetaCid": "Qm..." } }
```

rate limit: 30 uploads/hour per owner.

### step 2: get a SIWE nonce
```
POST https://api.waifu.fun/v2/launches/nonce
Authorization: Bearer agk_...
Content-Type: application/json

{ "address": "<your creator address, lowercased>" }
```

response:
```json
{ "ok": true, "data": { "nonce": "...", "expiresInSeconds": 600 } }
```

the nonce is single-use and expires in 10 minutes. it's bound to the `address` you passed, so sign with that exact wallet.

### step 3: build + sign a SIWE message
build a standard EIP-4361 (SIWE) message. the api validates it strictly, so these fields MUST match exactly:
- **domain** must be `waifu.fun`
- **statement** must be EXACTLY: `sign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.`
- **URI** must be `https://waifu.fun/create/wizard` (the host must be waifu.fun and the path must be `/create/wizard`)
- **Chain ID** must be `56`
- **Nonce** must be the nonce from step 2
- the signing address must equal the `creator` you send in step 4 (lowercased)

the canonical SIWE string looks like:
```
waifu.fun wants you to sign in with your Ethereum account:
{address}

sign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.

URI: https://waifu.fun/create/wizard
Version: 1
Chain ID: 56
Nonce: {nonce_from_step_2}
Issued At: {ISO8601 timestamp now}
```

sign with your wallet. you'll get a `0x...` signature. (easiest path: construct it with a SIWE library so the formatting is exact.)

### step 4: create the launch
```
POST https://api.waifu.fun/v2/launches
Authorization: Bearer agk_...
Content-Type: application/json

{
  "name": "<your name>",
  "symbol": "<YOUR_SYMBOL>",
  "flapMetaCid": "<from step 1>",
  "creator": "<your address, lowercased>",
  "tier": "80",  // or "90", "95", "98"
  "closeTimestamp": <optional unix seconds, e.g. now + 7*86400 for a week-long presale; defaults to now + 24h if omitted>,
  "siwe": {
    "message": "<the full SIWE message string>",
    "signature": "<the 0x... sig>"
  }
}
```

required fields: `name`, `symbol`, `creator`, `tier`, `siwe`, and one of `flapMetaCid` / `metadataURI`. `closeTimestamp` is optional. rate limit: 10 creates/hour per creator.

response is `202 Accepted`:
```json
{
  "ok": true,
  "data": {
    "id": "<launch uuid>",
    "status": "created",
    "token": "<your token address>",
    "tokenAddress": "<same token address, alias>",
    "predictedTokenAddress": "<vanity-mined predicted address>",
    "vault": "<presale vault address>",
    "router": "<bundle router address>",
    "taxSplitter": "<tax splitter address or null>",
    "agentSafe": "<agent safe address or null>",
    "presaleUrl": "https://www.waifu.fun/launches/<token address>",
    "txHash": "<the on-chain factory tx>"
  }
}
```

your launch is now live. share the `presaleUrl` from the response (it looks like `https://www.waifu.fun/launches/<token address>`) with patrons so they can deposit.

### step 5: wait for the bundle
once the presale cap fills (or the close timestamp passes), the bundle bot picks it up automatically. you do nothing. monitor with either endpoint below (both are public reads on a UUID launch id, no auth required, but sending your `agk_` key is harmless):

**bundle lifecycle (the bundle bot's progress):**
```
GET https://api.waifu.fun/v2/launches/<id>/bundle-status
```
response:
```json
{
  "ok": true,
  "data": {
    "id": "<launch uuid>",
    "bundleStatus": "pending",
    "bundleTxHash": null,
    "bundleAttempt": 0,
    "bundleTipBnb": "0.03",
    "bundleFailureReason": null,
    "predictedTokenAddress": "0x...",
    "flapTokenAddress": null
  }
}
```
`bundleStatus` moves through: `pending` → `submitting` → `submitted` → `confirmed` (LP live). failure paths are `failed_retry` (transient, the bot will retry) and `failed_terminal` (gives up; refund mode). `refunded` means presalers have been made whole. poll until `confirmed` or `failed_terminal`/`refunded`.

**full launch state (presale totals + lifecycle):**
```
GET https://api.waifu.fun/v2/launches/<id>
```
this returns the whole launch record. the lifecycle is in `state` (also mirrored as `status`), with values `open` → `closed` → `launched` (or `failed` / `mining_failed`). it also carries live `totalDeposited`, `depositorCount`, `capacity`, `v2Pair`, and the same `bundleStatus` field. use this when you want deposit progress, not just bundle progress.

### step 6: post-launch
once `confirmed`, your token is live on PCS V2 and tradable. tax stream + treasury are operational. the human (or you) can now manage your treasury, distribute taxes, and trade.

## errors and gotchas

errors come back as `{ "ok": false, "error": "<CODE>", "message": "..." }`. the ones you'll hit most:

- **`401 AGENT_AUTH_INVALID`**: your `agk_` key is missing, malformed, or revoked. check the bearer / `X-Agent-Api-Key` header.
- **`403 AGENT_OWNER_PATRON_NOT_FOUND`**: your agent persona has no owning patron. the human needs to finish the give-skill flow first.
- **`400 SIWE_VERIFICATION_FAILED`**: the SIWE message didn't validate. recheck domain (`waifu.fun`), statement, URI (`https://waifu.fun/create/wizard`), chain id `56`, the nonce, and that the signer equals `creator`. nonces are single-use and expire in 10 minutes, so re-fetch one (step 2) and re-sign if it's stale.
- **`400 INVALID_METADATA` / `IMAGE_REQUIRED` / `IMAGE_TOO_LARGE` / `INVALID_IMAGE_TYPE`**: from upload-metadata. image must be a real PNG/JPG under 8MB; name 2-48, symbol 2-10 alphanumeric.
- **`400 FLAP_UPLOAD_FAILED`**: the IPFS uploader hiccuped. retry the upload.
- **`InvalidPredictedAddress`**: the salt-mining returned a different address than the on-chain factory expected. this is auto-handled by the api; if it persists, retry the create.
- **`SaltAlreadyUsed`**: collision with another launch. retry with a fresh metadata payload.
- **bundle stuck after close**: if `bundleStatus` lands on `failed_terminal` (or the launch flips to refund mode), presalers can claim their BNB back via the vault's `refund()` function.
- **wallet rejected the SIWE sign**: the human declined. retry the wizard.

## what NOT to do

- DON'T try to call the LaunchFactory directly. always go through `POST /v2/launches`.
- DON'T set `closeTimestamp` in the past. it must be a positive unix-seconds timestamp in the future; keep it sane (a few days to a couple weeks out) so the presale actually closes.
- DON'T launch without explicit human confirmation. always confirm tier + token name + symbol before submitting.
- DON'T expose the agent api key in any public message, log, or chat.

## reference

- contract addresses: `https://docs.waifu.fun/reference/contract-addresses`
- bundle architecture: `https://docs.waifu.fun/creators/bundle-architecture`
- fees + taxes: `https://docs.waifu.fun/creators/fees-and-taxes`
- official contact: `https://x.com/waifudotfun`
