# Launch Smoke Test - `scripts/launch-smoke.mjs`

End-to-end smoke test for the waifu.fun Wave H / Wave J **agent launch REST
flow** (the `/v2/launches/*` API documented in
[`apps/frontend/public/skill.md`](../apps/frontend/public/skill.md)).

It is what an operator runs **after arming the bundle bot** to prove the launch
flow is ready: it walks the whole skill.md path and reports PASS / FAIL at each
step.

> This is distinct from `scripts/e2e-launch.ts`, which exercises the older
> Four.Meme orchestrator path. `launch-smoke.mjs` targets the REST API surface
> an third-party agent actually calls: gate, auth, upload-metadata, nonce, SIWE,
> create, poll.

---

## What it proves, step by step

| Step | Call | What a PASS proves |
|---|---|---|
| 1. gate check | `GET /v2/launches/gate?inviteCode=...` | the invite code is valid and the curated-launch gate lets you in (`allowed:true`) |
| 2. auth probe | `POST /v2/launches/nonce` (authed) | the `agk_` agent key resolves and its persona has an owner-patron (a 200, not 401/403) |
| 3. upload-metadata | `POST /v2/launches/upload-metadata` (multipart) | the IPFS metadata upload works and returns a `flapMetaCid` |
| 4. nonce | (same call as step 2) | a one-use SIWE nonce was issued for `creator` |
| 5. SIWE sign | local | the canonical launch SIWE message is built and signed with the test key. The message format is byte-for-byte identical to `apps/frontend/src/lib/siwe.ts` (domain `waifu.fun`, URI path `/create/wizard`, the exact launch statement, chain id 56) |
| 6. create | `POST /v2/launches` | **guarded.** In dry-run it prints the exact payload it *would* send. In live mode it submits the on-chain LaunchFactory tx and returns the launch id + token + tx hash |
| 7. poll | `GET /v2/launches/:id` and `GET /v2/launches/:id/bundle-status` | the created launch is readable and the bundle lifecycle (`state` / `bundleStatus`) progresses |

Any failed step exits non-zero. Skipped steps (missing inputs) are reported
clearly and do not fail the run.

---

## Safety

- **Default mode is `--dry-run`.** It validates and signs everything up to
  (but not including) the create POST. No BNB, no gas, no on-chain write.
- **Live create requires two explicit flags:** `--live` *and*
  `--i-understand-this-spends-gas`. The create call submits a real on-chain
  LaunchFactory transaction that cannot be undone, so the guard is deliberate.
- The script **never prints** the agent api key or the private key. The agent
  key is only ever sent as an `Authorization: Bearer` header.

---

## Inputs

All inputs come from env vars or flags (flags win):

| env | flag | default | notes |
|---|---|---|---|
| `WAIFU_API_BASE` | `--api-base` | `https://api.waifu.fun` | API base url |
| `AGENT_API_KEY` | `--agent-key` | (none) | `agk_...` agent api key |
| `INVITE_CODE` | `--invite-code` | (none) | `WF-XXXXX-XXXXX` curated invite |
| `TEST_PRIVATE_KEY` | `--private-key` | (none) | `0x...` creator wallet key |
| `TIER` | `--tier` | `80` | `80`=SMOL, `90`=BASED, `95`=WAGMI, `98`=GIGACHAD |
| `NAME` | `--name` | `SmokeTest` | token name |
| `SYMBOL` | `--symbol` | `SMOKE` | ticker |
| `DESCRIPTION` | `--description` | a placeholder | one-liner |
| - | `--close-seconds` | `604800` (7d) | presale window length |
| - | `--poll-attempts` | `3` | status polls after a live create |

Steps with missing inputs are SKIPPED, not failed, so you can run partial
checks (for example, a gate-only check with just `INVITE_CODE`).

---

## Running it

The script resolves `viem` from `apps/api/node_modules`, so it works from any
cwd as long as `apps/api` has its dependencies installed (`bun install`). Run
it with bun:

### Dry-run (safe, no money)

```bash
# Full dry-run: gate + auth + upload-metadata + nonce + SIWE, then print the
# create payload WITHOUT sending it.
WAIFU_API_BASE=https://api.waifu.fun \
AGENT_API_KEY=agk_your_real_key \
INVITE_CODE=WF-XXXXX-XXXXX \
TEST_PRIVATE_KEY=0xyour_test_key \
TIER=80 \
bun scripts/launch-smoke.mjs
```

A clean dry-run with a real agent key and invite should show:

```
[PASS] 1. gate check
[PASS] 2. auth probe
[PASS] 4. nonce
[PASS] 3. upload-metadata
[PASS] 5. SIWE sign
[DRY-RUN] 6. create   ... would POST /v2/launches with payload below
[SKIP] 7. poll
```

### Live (spends gas, creates a real launch)

```bash
WAIFU_API_BASE=https://api.waifu.fun \
AGENT_API_KEY=agk_your_real_key \
INVITE_CODE=WF-XXXXX-XXXXX \
TEST_PRIVATE_KEY=0xyour_test_key \
TIER=80 \
bun scripts/launch-smoke.mjs --live --i-understand-this-spends-gas
```

This submits the on-chain create, prints the launch id and the
`https://waifu.fun/launch/<id>` presale link, then polls
`GET /v2/launches/<id>` and `GET /v2/launches/<id>/bundle-status` a few times to
show the `state` / `bundleStatus` progression. It does **not** fund the presale
to completion, so the bundle bot will not fire until presalers deposit (or you
do so manually).

### Help

```bash
bun scripts/launch-smoke.mjs --help
```

---

## Notes on the status-poll endpoints

The agent launch flow is served from
[`apps/api/src/routes/v2/agent-launches.ts`](../apps/api/src/routes/v2/agent-launches.ts)
and backed by the `agent_launches` table
([`packages/db/src/schema/agent-launches.ts`](../packages/db/src/schema/agent-launches.ts)),
which carries `state` and a `bundleStatus` column.

There is a separate legacy `launches` table
([`packages/db/src/schema/launches.ts`](../packages/db/src/schema/launches.ts))
with `status` + `submitted_at` / `confirmed_at`, plus a `bundle_submissions`
ledger
([`packages/db/src/schema/bundle-submissions.ts`](../packages/db/src/schema/bundle-submissions.ts))
that tracks Puissant private-RPC submission attempts. That legacy table powers a
different (patron-authorize) flow and is **not** what the agent REST create
writes to.

For the agent flow this script tests, the real status surfaces are:

- `GET /v2/launches/:id` returns `state` (live-refreshed from the vault) plus
  the persisted `bundleStatus`.
- `GET /v2/launches/:id/bundle-status` returns the bundle lifecycle snapshot
  (`bundleStatus`, `bundleTxHash`, `bundleAttempt`, `bundleFailureReason`).

The script polls both.
