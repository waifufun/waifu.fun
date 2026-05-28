# Eliza Cloud Client Contract

waifu.fun provisions hosted agents through the Eliza Cloud API:

- `POST /api/v1/agents` is the first-class service provisioning contract. Eliza Cloud authenticates `X-Service-Key`, creates or reuses the agent wallet's Eliza Cloud account, grants the normal wallet signup credit when new, creates the character/sandbox under that wallet-owned org, and enqueues the hosted container provisioning job.
- Request payload includes token fields, `account.primaryWalletAddress`, role thresholds in `access`, model defaults, and `container.image`/`container.env` for the hosted runtime.
- Response fields parsed by waifu.fun: `cloudAgentId` (or `agentId`/`id` fallback), optional `containerId`, optional `containerUrl`, `jobId`, `polling`, `characterId`, `status`, token metadata aliases, and optional wallet/account metadata.

Default cloud routing:

- waifu.fun uses `https://elizacloud.ai` by default.
- `ELIZA_CLOUD_BASE_URL`: optional override for local development or staging Eliza Cloud origins.

Required production secret:

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
- `WAIFU_ELIZA_DEFAULT_MODEL`: waifu.fun-hosted launch default for every Eliza model tier; defaults to `openai/gpt-oss-120b`.
- `ELIZAOS_CLOUD_DEFAULT_MODEL`: compatibility fallback for the same hosted-launch model default.
- `ELIZAOS_CLOUD_SMALL_MODEL`: optional model default used by the older event-driven runtime provisioner when event data does not provide `smallModel`.
- Hosted agents receive `WAIFU_INITIAL_CREDIT_USD=5`, `WAIFU_ACCESS_GUEST_MIN_TOKENS=1000`, `WAIFU_ACCESS_USER_MIN_TOKENS=100000`, and `WAIFU_ACCESS_THRESHOLD_MODE=strict_gt` in container env.
- The agent EVM wallet is passed as `WAIFU_AGENT_EVM_ADDRESS`; the key is referenced by `WAIFU_AGENT_EVM_KEY_REF` and should stay in Steward/KMS custody.
- Eliza Cloud owns wallet-account creation for hosted waifu agents. `account.primaryWalletAddress` is the agent's Steward EVM wallet and becomes the primary wallet for the agent's Eliza Cloud account; the new wallet org receives the standard $5 free credit when created.
- The agent wallet is the Eliza Cloud account primary wallet. Creator, owner, or safe wallets are admin access wallets only; they must not be used as the agent account fallback when the Steward agent wallet is missing.
- Hosted provisioning fails before any Eliza Cloud request if the agent EVM wallet or container image URI is missing.
- Token chat pages request a short-lived chat session instead of embedding the raw container URL directly. The API grants `admin` to the creator/owner wallet, `user` to wallets holding more than `100000` tokens, `guest` to wallets holding more than `1000` tokens, and denies lower balances.
- Hosted Eliza runtimes verify that JWT with `WAIFU_CHAT_ACCESS_JWT_SECRET`, require issuer `waifu.fun` and audience `eliza-cloud-chat`, scope it to the provisioned token contract/chain, and map the wallet caller into Eliza world roles (`OWNER`, `USER`, or `GUEST`) before the chat turn is processed.
- Waifu-chat-enabled Eliza runtimes replace the default `X-Frame-Options: DENY` with a `frame-ancestors` policy so token pages can embed the hosted chat UI. Override the default `https://waifu.fun https://*.waifu.fun` with `WAIFU_CHAT_FRAME_ANCESTORS` if staging needs a different parent origin.
- waifu.fun stores the Eliza Cloud sandbox id as `agents.cloud_agent_id`. `agents.bridge_url` may contain a legacy container id when present, but new service-provisioned agents use `cloudAgentId` as the runtime control id.
- Owner suspend/resume/restart and credit-depleted shutdown target Eliza Cloud service controls: `POST /api/v1/agents/:agentId/suspend`, `POST /api/v1/agents/:agentId/resume`, and restart as suspend followed by resume.
- Credit top-ups call `POST /api/v1/credits/checkout` for the wallet-owned Eliza Cloud organization that pays agent hosting and model usage. waifu.fun client APIs keep `creditsAmount`/`amountUsdCents` in cents, but the Eliza Cloud checkout payload receives dollar units (`500` cents becomes `{ "credits": 5 }`).
- Operators can verify organization credit payment state through `GET /api/v1/credits/balance?fresh=true&agent_id=...` and apply a completed checkout fallback through `POST /api/billing/checkout/verify` from the `/admin/ops/eliza-cloud` test controls. With `X-Service-Key`, Eliza Cloud resolves `agent_id` to the wallet-owned agent organization before reading or applying credits.
- Token creators can create the same Eliza Cloud organization credit checkout from `/owner/tokens/:chain/:chainId/:contractAddress/billing/top-up`; the default top-up is `$5`. The container is resumed after the top-up is reflected, not merely when checkout is created.
- Service-provisioned Eliza Cloud agents store the waifu credit webhook on the sandbox config. The Eliza Cloud agent-billing cron signs `credits.low` and `credits.depleted` callbacks with `X-Waifu-Webhook-Signature`; waifu.fun maps those callbacks to model downgrade, dormant state, and container pause.
- The API launch paths, legacy claim/webhook provisioner, owner runtime activation endpoint, and worker `agent-provisioning` retry processor all use the same Eliza Cloud service provisioning model.
- EVM indexer graduation/migration handlers enqueue `agent-provisioning` jobs when a tracked agent token bonds to DEX liquidity, giving bonding events a direct container-launch retry path.

Operator test page:

- `/admin/ops/eliza-cloud` submits a real test provision through `POST /v2/admin/agents/eliza-cloud/test-provision`.
- In production, set `WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true` before the test endpoint will run.

Live smoke command:

- `npm run test:eliza-cloud:live` exercises the same admin API contract as the operator page. It refuses to create cloud resources unless `WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1` is set.
- Required env for the smoke: `WAIFU_API_BASE_URL`, `ADMIN_API_KEY`, `WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS`, and `WAIFU_ELIZA_SMOKE_AGENT_WALLET`. The API process itself must also have `ELIZA_CLOUD_BASE_URL`, `ELIZA_CLOUD_SERVICE_KEY`, `ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI`, `WAIFU_CHAT_ACCESS_JWT_SECRET`, `DATABASE_URL`, and `WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true`.
- The default `WAIFU_ELIZA_SMOKE_MODE=direct` path calls `POST /v2/admin/agents/eliza-cloud/test-provision`. It proves readiness, wallet-owned cloud provisioning, returned `cloudAgentId`, wallet/account metadata including the primary wallet and initial free-credit fields, runtime status polling until the hosted agent is running, runtime URL reachability when Eliza Cloud returns a URL, organization credit balance lookup, pause, resume, and restart. If `WAIFU_ELIZA_SMOKE_STEWARD_BEARER` is set, it also calls `/owner/tokens/:chain/:chainId/:contractAddress/chat-session`, verifies the returned role-scoped `waifu_access_token` URL, and probes that URL. Set `WAIFU_ELIZA_SMOKE_TOP_UP=1` to also create a real organization credit checkout.
- The smoke fails if the returned primary wallet does not match `WAIFU_ELIZA_SMOKE_AGENT_WALLET`. When Eliza Cloud reports `isNewAccount: true`, the smoke also requires `initialFreeCreditsUsd: 5`.
- Set `WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1` and `WAIFU_ELIZA_SMOKE_ENQUEUE_DRY_RUN=1` in direct mode to verify the bonding worker payload construction without writing to Redis. Direct mode refuses a real worker enqueue because that would enqueue the worker and then direct-provision the same agent.
- Set `WAIFU_ELIZA_SMOKE_MODE=worker` and `WAIFU_ELIZA_SMOKE_ENQUEUE_WORKER=1` to exercise the actual bonding worker path. Worker mode calls `/v2/admin/agents/eliza-cloud/test-enqueue-provisioning`, skips direct provisioning, polls `/v2/admin/agents/eliza-cloud/test-runtime-ref?agentId=...` until the worker writes Eliza Cloud runtime metadata, and then runs the same status, balance, pause, resume, restart, optional chat, and optional top-up checks against the worker-created cloud agent.

Example:

```sh
WAIFU_ELIZA_CLOUD_LIVE_SMOKE=1 \
WAIFU_API_BASE_URL=https://api-staging.waifu.fun \
ADMIN_API_KEY=... \
WAIFU_ELIZA_SMOKE_TOKEN_ADDRESS=0x0000000000000000000000000000000000000001 \
WAIFU_ELIZA_SMOKE_AGENT_WALLET=0x0000000000000000000000000000000000000009 \
npm run test:eliza-cloud:live
```

Use `WAIFU_ELIZA_SMOKE_WAIT_SECONDS` to change the default 180-second runtime readiness timeout.
Use `WAIFU_ELIZA_SMOKE_EXPECT_CHAT_ROLE=admin|user|guest` with `WAIFU_ELIZA_SMOKE_STEWARD_BEARER` when the smoke should assert a specific token-chat role.
