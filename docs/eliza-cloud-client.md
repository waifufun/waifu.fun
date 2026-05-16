# Eliza Cloud Client Contract

waifu.fun provisions hosted agents through the Eliza Cloud service API:

- `POST /api/v1/agents`
- Auth header: `X-Service-Key: $ELIZA_CLOUD_SERVICE_KEY`
- Payload fields: `tokenContractAddress`, `chain`, `chainId`, `tokenName`, `tokenTicker`, `launchType`, `character`, `billing`, and optional `webhookUrl`.
- Response fields parsed by waifu.fun: `cloudAgentId` (or `agentId`/`id` fallback), `jobId`, `polling`, `characterId`, `status`, and token metadata aliases.

Default cloud routing:

- waifu.fun uses `https://elizacloud.ai` by default.
- `ELIZA_CLOUD_BASE_URL`: optional override for local development or staging Eliza Cloud origins.

Required production secret:

- `ELIZA_CLOUD_SERVICE_KEY`: service credential sent as `X-Service-Key` for `/api/v1/agents`. This is backend-only auth so the public app cannot create cloud agents directly.

Compatibility env vars:

- `ELIZA_SERVICE_KEY`: accepted as a legacy alias for `ELIZA_CLOUD_SERVICE_KEY`.
- `ELIZA_CLOUD_API_KEY`: optional bearer credential for older Eliza Cloud routes.
- `ELIZA_API_URL`: legacy base URL fallback used when `ELIZA_CLOUD_BASE_URL` is absent.
- `ELIZA_JWT_SECRET`: legacy service JWT signing secret, only required when neither service-key nor API-key auth is configured.
- `ELIZA_SERVICE_USER_ID`: optional legacy JWT user id override.

Provisioning metadata defaults:

- `CHAIN_ID`: numeric chain id for the service payload when event data does not provide `chainId`; defaults to `56`.
- `WAIFU_ELIZA_DEFAULT_MODEL`: waifu.fun-hosted launch default for every Eliza model tier; defaults to `openai/gpt-oss-120b`.
- `ELIZAOS_CLOUD_DEFAULT_MODEL`: compatibility fallback for the same hosted-launch model default.
- `ELIZAOS_CLOUD_SMALL_MODEL`: optional model default used by the older event-driven runtime provisioner when event data does not provide `smallModel`.
