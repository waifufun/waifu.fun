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
| Wake/resurrect | `apps/api/src/routes/v2/agents.test.ts` covers `resurrectAgent` top-up, dormant-field clearing, premium model tier restoration, and `agent.resurrected` emission. Eliza reference has KEDA wake suites under `packages/cloud-infra/cloud/tests/`. |

## Focused Tests Added

| Requirement | Test added |
|---|---|
| Hosted is implicit in create | `apps/frontend/src/lib/api/agent-provision.test.ts` asserts provision payloads always send `{ kind: "hosted" }`, even when an older draft contains BYO runtime settings. |
| Hosted provision request does not leak BYO credentials | `apps/frontend/src/lib/api/agent-provision.test.ts` asserts stale webhook URLs/secrets are not serialized into the provision payload. |
| Invite remains mandatory at API validation | `apps/api/src/services/provision/payload-adapter.test.ts` asserts blank invite is rejected. |
| Hosted runtime reaches launch metadata | `apps/api/src/services/provision/payload-adapter.test.ts` asserts `runtimeKind: "hosted"` and null webhook fields. |
| Eliza Cloud service contract | `apps/api/src/services/eliza-client.test.ts` asserts `POST /api/v1/agents`, `X-Service-Key`, token metadata, billing, and model defaults. |
| Hosted provision after launch | `apps/api/src/routes/v2/agents.test.ts` asserts successful token launch calls Eliza Cloud and returns cloud ids/status. |
| Duplicate retry idempotency | `apps/api/src/routes/v2/agents.test.ts` asserts retries reuse existing cloud metadata instead of provisioning a second cloud agent. |

## Gaps To Reconcile With Implementation Owners

| Gap | Proposed validation |
|---|---|
| Hetzner target proof | Waifu now calls the Eliza Cloud `/api/v1/agents` service API; if Eliza Cloud adds or requires an explicit `infraTarget: "hetzner"` field, add that to the client contract test. Current validation depends on Eliza Cloud owning Hetzner placement behind the service API. |
| Live Eliza Cloud provisioning | Run a staging invite launch with `ELIZA_CLOUD_BASE_URL` and `ELIZA_CLOUD_SERVICE_KEY`, then verify Eliza Cloud returns `cloudAgentId`, `jobId`, and running container state. Mocked tests cover request shape, not live capacity. |
| X account binding before hosted launch | Add a route-level test that provision/launch rejects or records missing X binding according to the final policy; keep OAuth provider route contract separate from account-linking state. |
| Wake from scaled-to-zero | Keep unit coverage in waifu.fun for dispatch/resurrect state changes; run Eliza Cloud KEDA/Hetzner suites externally for actual pod wake (`packages/cloud-infra/cloud/tests/02-agent-lifecycle`, `03-multi-agent-capacity`, `09-gateway-e2e`). |

## Manual Staging Pass

1. Sign in with X via `/auth/oauth/start?provider=twitter&return_to=/create`.
2. Complete create with a valid single-use invite and default hosted runtime.
3. Confirm provision result includes agent id, token address, Safe address, and one-time agent API key.
4. Confirm Eliza Cloud shows a Hetzner-backed agent/container using gpt-oss-120b default model config.
5. Let the hosted runtime scale idle, then send an inbound event and verify it wakes and processes.
6. Mark/detect agent dormant, call `/v2/agents/:id/resurrect` with positive credits, and verify Eliza Cloud top-up, database active state, premium model tier, and `agent.resurrected` event.
