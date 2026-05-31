# X Invite Hosted Validation

Scope: end-to-end requirement covering X login, invite-gated create, launch submission, hosted runtime provisioning on Eliza Cloud/Hetzner, gpt-oss-120b defaults, and wake/resurrect behavior.

## Existing Coverage

| Area | Current checks |
|---|---|
| X login route contract | `apps/api/test/auth-route-contract/auth-route-contract.test.ts` covers `/auth/oauth/start?provider=twitter`. Frontend route smoke covers Twitter finalize and patron X callback paths. |
| Invite gate | `apps/api/src/routes/v2/agents.test.ts` covers idempotent invite redemption, last-invite reservation, release on failed launch, and single-use retry recovery. |
| Provision payload | `apps/frontend/src/lib/api/agent-provision.test.ts` covers invite forwarding, launchpad forwarding, hosted runtime payload shape, and webhook URL/secret handling. |
| Provision adapter | `apps/api/src/services/provision/payload-adapter.test.ts` covers invite requirement, hosted/webhook/pull runtime validation, Safe owner/tax mapping, and launchpad validation. |
| Launch | `apps/api/src/routes/v2/agents.test.ts` covers authenticated `/v2/agents/launch` agentId injection. Launch-v2 tests cover tier-aware launch service behavior. |
| Bonding trigger | `apps/evm-indexer/src/handlers/fourmeme-handlers.test.ts` covers Four.Meme `LiquidityAdded` and Portal `LaunchedToDEX` provisioning payloads. `apps/launch-indexer/src/handlers/flap.test.ts` covers the Flap `LaunchedToDEX` path enqueuing `agent-provisioning` when a linked persona is found. |
| Wake/resurrect | `apps/api/src/routes/v2/agents.test.ts` covers `resurrectAgent` top-up, dormant-field clearing, premium model tier restoration, and `agent.resurrected` emission. Eliza Cloud agent-billing now calls the signed waifu credit webhook for low/depleted credits, which waifu maps to downgrade/dormant shutdown. Eliza reference has KEDA wake suites under `packages/cloud-infra/cloud/tests/`. |

## Focused Tests Added

| Requirement | Test added |
|---|---|
| Hosted is implicit in create | `apps/frontend/src/lib/api/agent-provision.test.ts` asserts provision payloads always send `{ kind: "hosted" }`, even when an older draft contains BYO runtime settings. |
| Hosted provision request does not leak BYO credentials | `apps/frontend/src/lib/api/agent-provision.test.ts` asserts stale webhook URLs/secrets are not serialized into the provision payload. |
| Invite remains mandatory at API validation | `apps/api/src/services/provision/payload-adapter.test.ts` asserts blank invite is rejected. |
| Hosted runtime reaches launch metadata | `apps/api/src/services/provision/payload-adapter.test.ts` asserts `runtimeKind: "hosted"` and null webhook fields. |
| Eliza Cloud service contract | `apps/api/src/services/eliza-client.test.ts` asserts `POST /api/v1/agents`, service-key headers, wallet-owned account provisioning, token metadata, billing, role thresholds, container image/env, and model defaults. |
| Hosted provision after launch | `apps/api/src/routes/v2/agents.test.ts` asserts successful token launch calls Eliza Cloud and returns cloud ids/status. |
| Duplicate retry idempotency | `apps/api/src/routes/v2/agents.test.ts` asserts retries reuse existing cloud metadata instead of provisioning a second cloud agent. |

## Gaps To Reconcile With Implementation Owners

| Gap | Proposed validation |
|---|---|
| Hetzner/container target proof | Waifu now calls the Eliza Cloud service provisioning API and sends `container.image`/runtime env. If Eliza Cloud adds or requires an explicit infra target field, add it to the `/api/v1/agents` contract tests. Current validation depends on Eliza Cloud owning placement behind its sandbox provisioning worker. |
| Live Eliza Cloud provisioning | Run a staging invite launch, `/admin/ops/eliza-cloud`, or `npm run test:eliza-cloud:live` with `ELIZA_CLOUD_BASE_URL`, `ELIZA_CLOUD_SERVICE_KEY`, `ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI`, `WAIFU_CHAT_ACCESS_JWT_SECRET`, `WEBHOOK_RECEIVER_SECRET`, `DATABASE_URL`, `WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true`, and `ADMIN_API_KEY`, then verify Eliza Cloud returns `cloudAgentId`, wallet-account metadata including the agent primary wallet and initial free-credit fields, job polling, runtime status reaches running with a public hosted web UI URL, that hosted URL is reachable, organization credit balance is readable, credit-low/depleted webhooks are accepted, and pause/resume/restart control succeeds. Focused Eliza Cloud route tests cover service provisioning, credit balance/checkout/verify, signed billing-cron low/depleted callbacks, and control-compatible status shape; live staging still proves real capacity. |
| X account binding before hosted launch | Add a route-level test that provision/launch rejects or records missing X binding according to the final policy; keep OAuth provider route contract separate from account-linking state. |
| Wake from scaled-to-zero | Keep unit coverage in waifu.fun for dispatch/resurrect state changes; run Eliza Cloud KEDA/Hetzner suites externally for actual pod wake (`packages/cloud-infra/cloud/tests/02-agent-lifecycle`, `03-multi-agent-capacity`, `09-gateway-e2e`). |

## Manual Staging Pass

1. Sign in with X via `/auth/oauth/start?provider=twitter&return_to=/create`.
2. Complete create with a valid single-use invite and default hosted runtime.
3. Confirm provision result includes agent id, token address, Safe address, and one-time agent API key.
4. Confirm Eliza Cloud shows the agent under the Steward EVM wallet-owned account, the wallet account received its initial credit when new, and the hosted container is using gpt-oss-120b default model config.
5. Confirm the token page chat route returns a role-scoped `waifu_access_token` for the creator/admin and for holders above the strict token thresholds, and that the embedded Eliza UI accepts the token without exposing full runtime control to guest/user holders.
6. Let the hosted runtime scale idle, then send an inbound event and verify it wakes and processes.
7. Mark/detect agent dormant, create an organization credit checkout from `/owner/tokens/:chain/:chainId/:contractAddress/billing/top-up`, complete payment, verify the checkout and organization balance from `/admin/ops/eliza-cloud`, then verify the Eliza Cloud credit webhook resumes the container, clears dormant state, restores premium model tier, and emits `agent.resurrected`.

`/admin/ops/eliza-cloud` is the manual operator surface for this checklist. It
can direct-provision a test agent, enqueue the real bonding worker job with
dry-run or live queue mode, poll the worker-written runtime reference, run
lifecycle and billing controls, simulate Eliza Cloud `credits.depleted` and
`credits.topped_up` callbacks through the server consumer path, verify a
completed checkout session, and test the token-page chat role with a creator or
holder Steward bearer.

## Live Smoke Command

Run the smoke-runner preflight suite in CI or before a staging run:

```sh
npm run test:eliza-cloud:smoke
```

This command is intentionally safe: it does not contact Eliza Cloud or a real
waifu.fun API. It proves the live smoke runner still fails closed when required
live inputs are missing, validates EVM wallet inputs and direct-vs-worker
safety gates, pins hosted runtime URL/status parsing, and runs the actual CLI
process against a local mock admin API in direct and worker modes. The mock
contract also exercises token chat-session verification and completed top-up
verification so those optional live branches are covered before staging runs.

Use the live smoke when the API is already running with staging Eliza Cloud secrets:

```sh
WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1 \
WAIFU_API_BASE_URL=https://api-staging.waifu.fun \
ADMIN_API_KEY=... \
WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000001 \
WAIFU_ELIZA_SMOKE_AGENT_WALLET=0x0000000000000000000000000000000000000009 \
WAIFU_ELIZA_SMOKE_WALLET_KEY_REF=steward:waifu-live-smoke \
npm run test:eliza-cloud:live
```

For an ephemeral staging test key, `WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY` can be
used instead of `WAIFU_ELIZA_SMOKE_AGENT_WALLET`; the runner derives the EVM
address locally and never sends the private key to the API. You can also set
`WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET=1` to generate a smoke-only private
key in-process and send only the derived address. If wallet and private key are
both set, they must match; generated-wallet mode cannot be combined with either
explicit wallet input. Do not use production agent private keys in operator
shells; production agents should use Steward/KMS custody and verify the key
reference with `WAIFU_ELIZA_SMOKE_WALLET_KEY_REF`.

Passing output includes readiness, provision, account evidence with a primary wallet matching `WAIFU_ELIZA_SMOKE_AGENT_WALLET`, the address derived from `WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY`, or the generated smoke wallet, `$5` initial free credit when Eliza reports a new account, repeated runtime status checks until running, runtime URL reachability when available, balance, pause, resume, restart, running-status checks after resume and restart, and a final JSON object with `cloudAgentId`, optional `containerId`, optional `containerUrl`, `status`, `polling`, and wallet/account provisioning metadata. Set `WAIFU_ELIZA_SMOKE_WALLET_KEY_REF` to verify the Steward/KMS key reference used as the agent account key. Set `WAIFU_ELIZA_SMOKE_WAIT_SECONDS` to change the default 180-second runtime readiness timeout. Set `WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1` with `WEBHOOK_RECEIVER_SECRET` to post signed Eliza Cloud `credits.depleted` and `credits.topped_up` webhooks, verify the hosted runtime becomes dormant/shut down, and verify it returns to running. Set `WAIFU_ELIZA_SMOKE_TOP_UP=1` only when the run should create a real organization credit checkout. After completing a checkout, rerun with `WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION=cs_...` to verify Eliza Cloud applied or recognized the payment, re-read the organization balance, and confirm the runtime is running again.

For the strongest staging proof, set `WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1`
or pass `--full-e2e`.
That preflight gate requires worker mode, real worker enqueue, token-page chat
verification with `WAIFU_ELIZA_SMOKE_STEWARD_BEARER` and
`WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE`, owner runtime verification with
`WAIFU_ELIZA_SMOKE_OWNER_BEARER` and a mutating owner control (`restart` by
default, or `WAIFU_ELIZA_SMOKE_OWNER_RUNTIME_ACTION=resume`), signed lifecycle webhook verification with
`WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1` and `WEBHOOK_RECEIVER_SECRET`,
and completed checkout verification via `WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION`.
Use `WAIFU_ELIZA_SMOKE_TOP_UP=1` in an earlier run to create the checkout,
complete it, then rerun this full proof with the completed `cs_...` session.

To verify the bonding worker queue payload construction without writing to Redis:

```sh
WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1 \
WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1 \
npm run test:eliza-cloud:live
```

To exercise the actual bonding worker path, run worker mode:

```sh
WAIFU_ELIZA_SMOKE_MODE=worker \
WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1 \
npm run test:eliza-cloud:live
```

Worker mode requires the API to have Redis/queue access and the worker to be running. It enqueues the same `agent-provisioning` job shape produced by the Four.meme `LiquidityAdded` and `LaunchedToDEX` handlers, skips the direct provision endpoint, polls `/v2/admin/agents/eliza-cloud/test-runtime-ref?agentId=...` until the worker writes runtime metadata, and then runs the same runtime controls against the worker-created cloud agent. Direct mode refuses a real enqueue without `WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1` to avoid launching two containers for the same smoke agent.

To include token-page chat in the live smoke, provide a Steward bearer for a wallet that can access the token:

```sh
WAIFU_ELIZA_SMOKE_STEWARD_BEARER=... \
WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE=user \
npm run test:eliza-cloud:live
```

The chat branch calls `/owner/tokens/:chain/:chainId/:contractAddress/chat-session`, verifies the role-scoped `waifu_access_token` URL, and probes the hosted chat URL. It requires the smoke token to exist in the API database with hosted runtime metadata; the standalone admin test-provision endpoint creates cloud resources but does not itself create a token DB row.

For the final hosted-agent proof, keep the JSON summary printed after
`[eliza-cloud-smoke] live smoke passed`. In full-E2E mode it should show the
wallet-owned `account`, `cloudAgentId`, `webUiUrl`,
`hostedUrlReachable: true`, `hostedUrlStatus`, running runtime status,
`chatSession.role` with `hasChatUrl: true`, `ownerRuntime.running: true`,
`ownerRuntime.hasWebUiUrl: true`, `ownerRuntime.controlOk: true`,
`lifecycleWebhooks.dormantStatus`, `lifecycleWebhooks.runningStatus`, and
`topUpVerification` evidence for a completed or already-applied checkout. The
signed chat URL is intentionally not included in that summary.
