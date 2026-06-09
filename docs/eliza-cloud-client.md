# Eliza Cloud Client Contract

waifu.fun provisions hosted agents through the Eliza Cloud API:

- `POST /api/v1/agents` is the first-class service provisioning contract. Eliza Cloud authenticates `X-Service-Key`, creates or reuses the agent wallet's Eliza Cloud account, grants the normal wallet signup credit when new, creates the character/sandbox under that wallet-owned org, and enqueues the hosted container provisioning job.
- Request payload includes token fields, `account.primaryWalletAddress`, role thresholds in `access`, model defaults, and `container.image` plus optional container launch hints (`projectName`, `port`, `cpu`, `memory`, `desiredCount`, `architecture`, `healthCheckPath`) and `container.env` for the hosted runtime. Eliza Cloud preserves non-secret container hints on the sandbox config; `container.port` becomes the default runtime `PORT` unless explicitly overridden by container env.
- Response fields parsed by waifu.fun: `cloudAgentId` (or `agentId`/`id` fallback), optional `containerId`, optional `containerUrl`, `jobId`, `polling`, `characterId`, `status`, token metadata aliases, and optional wallet/account metadata.

Default cloud routing:

- waifu.fun uses `https://api.elizacloud.ai` by default. Production workers should still set `ELIZA_CLOUD_BASE_URL=https://api.elizacloud.ai` explicitly so the queue processor never falls back to a marketing-site origin.
- `ELIZA_CLOUD_BASE_URL`: optional override for local development or staging Eliza Cloud origins.

Required production secret:

- `WAIFU_AUTO_PROVISION_ON_LAUNCH`: opt-in API flag for LaunchFactory `POST /v2/launches` to create the persona/wallet records and enqueue `agent-provisioning`. Leave unset/false until staging env and wallet-EOA creation are confirmed.
- `ELIZA_CLOUD_SERVICE_KEY`: Eliza Cloud waifu service credential sent as `X-Service-Key` and compatibility `X-API-Key`. This is backend-only auth so the public app cannot create cloud agents directly.
- `ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI`: container image URI sent as `container.image` to Eliza Cloud's service provisioning API.

Compatibility env vars:

- `ELIZA_SERVICE_KEY`: accepted as a legacy alias for `ELIZA_CLOUD_SERVICE_KEY`.
- `ELIZAOS_CLOUD_API_KEY` / `ELIZAOS_API_KEY`: official ElizaOS Cloud API key aliases accepted by waifu.fun.
- `ELIZA_CLOUD_API_KEY`: waifu.fun compatibility alias for the same API key.
- `ELIZA_API_URL`: legacy base URL fallback used when `ELIZA_CLOUD_BASE_URL` is absent.
- `ELIZA_JWT_SECRET`: legacy service JWT signing secret, only required when neither service-key nor API-key auth is configured.
- `ELIZA_SERVICE_USER_ID`: optional legacy JWT user id override.
- `WAIFU_CHAT_ACCESS_JWT_SECRET`: shared secret for short-lived hosted chat access tokens. The API signs `/owner/tokens/:chain/:chainId/:contractAddress/chat-session` responses with this secret, and hosted containers receive it as `WAIFU_CHAT_ACCESS_JWT_SECRET` when configured.
- `WEBHOOK_RECEIVER_SECRET`: waifu.fun secret used to verify signed Eliza Cloud credit webhooks.
- `ELIZA_CLOUD_WEBHOOK_URL`: optional override for Eliza Cloud credit lifecycle callbacks. When unset, waifu.fun derives `${WAIFU_API_BASE_URL|API_ORIGIN|NEXT_PUBLIC_API_URL}/v2/webhooks/eliza-cloud/credits`.
- `ELIZA_CLOUD_WEBHOOK_SECRET`: optional override for the secret sent to Eliza Cloud for credit lifecycle callback signing. When unset, waifu.fun sends `WEBHOOK_RECEIVER_SECRET`.

Provisioning metadata defaults:

- `CHAIN_ID`: numeric chain id for the service payload when event data does not provide `chainId`; defaults to `56`.
- `WAIFU_ELIZA_DEFAULT_MODEL`: waifu.fun-hosted launch default for every Eliza model tier; defaults to `anthropic/claude-haiku-4.5`. Set this one env var to flip the hosted-agent default without code changes.
- `ELIZAOS_CLOUD_DEFAULT_MODEL`: compatibility fallback for the same hosted-launch model default.
- BitRouter-verified model slugs: `anthropic/claude-haiku-4.5` (current safe default), `anthropic/claude-sonnet-4.6`, and `x-ai/grok-4.20`.
- Frontier-open target slugs to re-test once BitRouter routes them: `moonshotai/kimi-k2.6`, `z-ai/glm-5.1`, and `deepseek/deepseek-v4-pro`.
- `ELIZAOS_CLOUD_SMALL_MODEL`: optional model default used by the older event-driven runtime provisioner when event data does not provide `smallModel`.
- Hosted agents receive `WAIFU_INITIAL_CREDIT_USD=5`, `WAIFU_ACCESS_GUEST_MIN_TOKENS=1000`, `WAIFU_ACCESS_USER_MIN_TOKENS=100000`, and `WAIFU_ACCESS_THRESHOLD_MODE=strict_gt` in container env.
- The agent EVM wallet is passed as `WAIFU_AGENT_EVM_ADDRESS`; the key is referenced by `WAIFU_AGENT_EVM_KEY_REF` and should stay in Steward/KMS custody. Direct provisions, worker provisions, and the admin ops test page all forward an explicit `walletKeyRef` when supplied, otherwise they default to `steward:<agentId>`.
- The legacy event-driven runtime provisioner and bonding worker payloads can forward `containerImageUri`/`imageUri`, optional `containerProjectName`, optional `containerPort`, and string-only `containerEnvironmentVars`/`containerEnv` into the same Eliza Cloud service contract.
- Eliza Cloud owns wallet-account creation for hosted waifu agents. `account.primaryWalletAddress` is the agent's Steward EVM wallet and becomes the primary wallet for the agent's Eliza Cloud account; the new wallet org receives the standard $5 free credit when created.
- The agent wallet is the Eliza Cloud account primary wallet. Creator, owner, or safe wallets are admin access wallets only; they must not be used as the agent account fallback when the Steward agent wallet is missing.
- Hosted provisioning fails before any Eliza Cloud request if the agent EVM wallet or container image URI is missing.
- Token-page chat and live readiness require Eliza Cloud to return `webUiUrl`. `containerUrl` is retained as lower-level runtime metadata but is not sufficient to mark a waifu agent live or iframe-ready.
- Token chat pages request a short-lived chat session instead of embedding the raw container URL directly. The API grants `admin` to the creator/owner wallet, `user` to wallets holding more than `100000` tokens, `guest` to wallets holding more than `1000` tokens, and denies lower balances.
- Hosted Eliza runtimes verify that JWT with `WAIFU_CHAT_ACCESS_JWT_SECRET`, require issuer `waifu.fun` and audience `eliza-cloud-chat`, scope it to the provisioned token contract/chain, and map the wallet caller into Eliza world roles (`OWNER`, `USER`, or `GUEST`) before the chat turn is processed.
- Waifu-chat-enabled Eliza runtimes replace the default `X-Frame-Options: DENY` with a `frame-ancestors` policy so token pages can embed the hosted chat UI. Override the default `https://waifu.fun https://*.waifu.fun` with `WAIFU_CHAT_FRAME_ANCESTORS` if staging needs a different parent origin.
- waifu.fun stores the Eliza Cloud sandbox id as `agents.cloud_agent_id`. `agents.bridge_url` may contain a legacy container id when present, but new service-provisioned agents use `cloudAgentId` as the runtime control id.
- Owner suspend/resume/restart and credit-depleted shutdown target Eliza Cloud service controls: `POST /api/v1/agents/:agentId/suspend`, `POST /api/v1/agents/:agentId/resume`, and restart as suspend followed by resume.
- Credit top-ups call `POST /api/v1/credits/checkout` for the wallet-owned Eliza Cloud organization that pays agent hosting and model usage. waifu.fun client APIs keep `creditsAmount`/`amountUsdCents` in cents, but the Eliza Cloud checkout payload receives dollar units (`500` cents becomes `{ "credits": 5 }`).
- Operators can verify organization credit payment state through `GET /api/v1/credits/balance?fresh=true&agent_id=...` and apply a completed checkout fallback through `POST /api/billing/checkout/verify` from the `/admin/ops/eliza-cloud` test controls. With `X-Service-Key`, Eliza Cloud resolves `agent_id` to the wallet-owned agent organization before reading or applying credits.
- Token creators can create the same Eliza Cloud organization credit checkout from `/owner/tokens/:chain/:chainId/:contractAddress/billing/top-up`; the default top-up is `$5`. The container is resumed after the top-up is reflected, not merely when checkout is created.
- Service-provisioned Eliza Cloud agents store the waifu credit webhook on the sandbox config. The Eliza Cloud agent-billing cron signs `credits.low` and `credits.depleted` callbacks with `X-Waifu-Webhook-Signature`; waifu.fun maps those callbacks to model downgrade, dormant state, and container pause.
- Eliza Cloud route coverage pins the agent-billing cron callback contract: when an agent lacks enough balance for the next hourly charge it sends signed `credits.low`, and after the grace window expires it suspends the sandbox and sends signed `credits.depleted`.
- The API launch paths, legacy claim/webhook provisioner, owner runtime activation endpoint, and worker `agent-provisioning` retry processor all use the same Eliza Cloud service provisioning model.
- EVM indexer graduation/migration handlers enqueue `agent-provisioning` jobs when a tracked agent token bonds to DEX liquidity, giving bonding events a direct container-launch retry path. The launch-indexer Flap `LaunchedToDEX` handler also enqueues the same job when it can resolve a linked `agent_personas` row by the final or predicted token address, so either bonding observer can launch the hosted agent.

Operator test page:

- `/admin/ops/eliza-cloud` submits a real test provision through `POST /v2/admin/agents/eliza-cloud/test-provision`.
- The same page can enqueue the bonding worker job with `agent.bonded`, `agent.graduated`, `token.migrated`, or `manual` source, choose dry-run vs real queue writes, poll the worker-written runtime reference, run pause/resume/restart/status/balance/top-up/verify controls, simulate Eliza Cloud `credits.depleted` and `credits.topped_up` lifecycle callbacks through the same consumer path, verify token-page chat access with a creator or holder Steward bearer, and call hosted Eliza `/api/conversations` with the issued waifu JWT.
- In production, set `WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true` before the test endpoint will run.

Live smoke command:

- `npm run test:eliza-cloud:smoke` is the CI-safe suite for the live smoke runner itself. It does not contact Eliza Cloud or a real waifu.fun API. It verifies required env validation, EVM address validation, direct/worker safety gates, full-E2E proof gates, top-up/chat-role inputs, signed lifecycle webhook inputs, hosted URL preference, running/dormant status normalization, API base URL fallback behavior, and the full CLI process against a local mock admin API in direct and worker modes. The mock CLI contract also executes token chat-session verification, owner runtime control verification, signed `credits.depleted`/`credits.topped_up` lifecycle webhook verification, completed top-up verification, and full-E2E worker mode with a mutating owner restart/resume control so those live branches stay covered before staging runs. The root `npm test` command runs this suite after workspace tests so live-smoke guardrails stay covered in CI.
- `npm run test:eliza-cloud:live` exercises the same admin API contract as the operator page. It refuses to create cloud resources unless `WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1` is set.
- Required env for the smoke: `WAIFU_API_BASE_URL`, `ADMIN_API_KEY`, `WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS`, and either `WAIFU_ELIZA_SMOKE_AGENT_WALLET`, `WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY`, or `WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET=1`. When the private key is supplied, the runner derives the EVM address locally and never sends the private key to waifu.fun or Eliza Cloud. `WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET=1` creates an ephemeral local private key for staging smoke and sends only the derived address. If wallet and private key are both supplied, the runner fails unless they match; generated-wallet mode cannot be combined with explicit wallet/private-key inputs. The API process itself must also have `ELIZA_CLOUD_BASE_URL`, `ELIZA_CLOUD_SERVICE_KEY`, `ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI`, `WAIFU_CHAT_ACCESS_JWT_SECRET`, `DATABASE_URL`, `WEBHOOK_RECEIVER_SECRET`, and either `ELIZA_CLOUD_WEBHOOK_URL` or a public API base env (`WAIFU_API_BASE_URL`, `API_ORIGIN`, or `NEXT_PUBLIC_API_URL`) so Eliza Cloud can call back into `/v2/webhooks/eliza-cloud/credits`. In production, set `WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true`.
- The default `WAIFU_ELIZA_SMOKE_MODE=direct` path calls `POST /v2/admin/agents/eliza-cloud/test-provision`. It proves readiness, wallet-owned cloud provisioning, returned `cloudAgentId`, wallet/account metadata including the primary wallet and initial free-credit fields, runtime status polling until the hosted agent is running with a public hosted web UI URL, hosted URL reachability, organization credit balance lookup, pause, resume, restart, and running-status checks after resume and restart. Set `WAIFU_ELIZA_SMOKE_WALLET_KEY_REF=...` when the live run should verify a specific Steward/KMS key reference instead of the default `steward:<agentId>`. If `WAIFU_ELIZA_SMOKE_STEWARD_BEARER` is set, it also calls `/owner/tokens/:chain/:chainId/:contractAddress/chat-session`, verifies the returned role-scoped `waifu_access_token` URL, probes that URL, and calls the hosted Eliza `/api/conversations` endpoint with the JWT so the cloud runtime must accept the token. Set `WAIFU_ELIZA_SMOKE_VERIFY_LIFECYCLE_WEBHOOK=1` with `WEBHOOK_RECEIVER_SECRET` to post signed Eliza Cloud `credits.depleted` and `credits.topped_up` webhooks, verify the hosted runtime becomes dormant/shut down, and verify it returns to running after the top-up event. Set `WAIFU_ELIZA_SMOKE_TOP_UP=1` to also create a real organization credit checkout. Set `WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION=cs_...` after completing a checkout to verify Eliza Cloud applied or recognized the payment, re-read organization balance, and confirm the runtime is running again.
- The smoke fails if the returned primary wallet does not match `WAIFU_ELIZA_SMOKE_AGENT_WALLET` or the address derived from `WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY`. When Eliza Cloud reports `isNewAccount: true`, the smoke also requires `initialFreeCreditsUsd: 5`.
- A successful live run prints `[eliza-cloud-smoke] live smoke passed` followed by a JSON proof summary. Set `WAIFU_ELIZA_SMOKE_PROOF_FILE=tmp/eliza-cloud-live-proof.json` to also write the same summary as a machine-readable artifact. For full-E2E runs this summary must include the wallet-owned `account`, `cloudAgentId`, `webUiUrl`, `hostedUrlReachable: true`, `hostedUrlStatus`, runtime status, `chatSession.role` plus `chatSession.hasChatUrl: true`, `chatSession.tokenSignatureVerified: true`, and `chatSession.hostedApiAcceptedToken: true`, `ownerRuntime.running: true`, `ownerRuntime.hasWebUiUrl: true`, a mutating `ownerRuntime.controlAction` of `restart` or `resume`, `ownerRuntime.controlOk: true`, `lifecycleWebhooks.dormantStatus`, `lifecycleWebhooks.runningStatus`, and `topUpVerification` with applied-or-already-applied credit evidence. The summary intentionally omits the signed `waifu_access_token` URL.
- Set `WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1` and `WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1` in direct mode to verify the bonding worker payload construction without writing to Redis. Direct mode refuses a real worker enqueue because that would enqueue the worker and then direct-provision the same agent.
- Set `WAIFU_ELIZA_SMOKE_MODE=worker` and `WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1` to exercise the actual bonding worker path. Worker mode calls `/v2/admin/agents/eliza-cloud/test-enqueue-provisioning`, skips direct provisioning, polls `/v2/admin/agents/eliza-cloud/test-runtime-ref?agentId=...` until the worker writes Eliza Cloud runtime metadata, and then runs the same status, balance, pause, resume, restart, optional chat, and optional top-up checks against the worker-created cloud agent.
- Set `WAIFU_ELIZA_SMOKE_REQUIRE_FULL_E2E=1` or pass `--full-e2e` for the strongest staging proof. This fails preflight unless worker mode is enabled, token chat verification has a Steward bearer, expected role, and `WAIFU_CHAT_ACCESS_JWT_SECRET` for HMAC verification, owner runtime verification has an owner bearer and uses a mutating owner runtime action (`restart` by default, or `WAIFU_ELIZA_SMOKE_OWNER_RUNTIME_ACTION=resume`), signed lifecycle webhook verification is enabled with `WEBHOOK_RECEIVER_SECRET`, and a completed checkout session is provided for top-up verification. Use `WAIFU_ELIZA_SMOKE_TOP_UP=1` in an earlier run to create the real checkout, complete that checkout, then rerun full-E2E mode with `WAIFU_ELIZA_SMOKE_VERIFY_TOP_UP_SESSION=cs_...`.

Example:

```sh
WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1 \
WAIFU_API_BASE_URL=https://api-staging.waifu.fun \
ADMIN_API_KEY=... \
WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000001 \
WAIFU_ELIZA_SMOKE_AGENT_WALLET=0x0000000000000000000000000000000000000009 \
npm run test:eliza-cloud:live
```

Equivalent strict invocation:

```sh
npm run test:eliza-cloud:live -- --full-e2e
```

For a local staging smoke with an ephemeral test key, you may replace
`WAIFU_ELIZA_SMOKE_AGENT_WALLET` with `WAIFU_ELIZA_SMOKE_AGENT_PRIVATE_KEY`, or
set `WAIFU_ELIZA_SMOKE_GENERATE_AGENT_WALLET=1` to generate the key in-process.
Do not use production agent private keys in operator shells; production agents
should use Steward/KMS key references such as `WAIFU_ELIZA_SMOKE_WALLET_KEY_REF`.

Use `WAIFU_ELIZA_SMOKE_WAIT_SECONDS` to change the default 180-second runtime readiness timeout.
Use `WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE=admin|user|guest` with `WAIFU_ELIZA_SMOKE_STEWARD_BEARER` when the smoke should assert a specific token-chat role.
