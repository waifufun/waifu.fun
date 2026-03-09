# Wave 8 — Agent Creation E2E + milady-cloud Integration

## Goal
Wire waifu.fun's create flow end-to-end so a user can:
1. Connect wallet (RainbowKit)
2. Enter invite code
3. Configure agent (name, bio, image, token params)
4. Sign BSC tx (Portal `newTokenV5`) → token created on-chain
5. Agent container provisioned automatically (milady-cloud)
6. Redirect to token page showing live agent status

**Two systems, one flow:** waifu-core handles token launch + DB. milady-cloud handles agent runtime. Both run on the same VPS (`89.167.63.246`) so integration is `localhost:3000` ↔ `localhost:3100`.

---

## Current State (What Works)

### waifu.fun frontend (`/create`)
- ✅ Invite code gating UI (input, validation, retry)
- ✅ 3 modes: Auto (AI image gen), Manual (upload), Import
- ✅ Form fields: name, ticker, description, pre-buy amount, vanity address, curve limit, delayed start, trade limit
- ✅ `DeployButton` component with loading state
- ✅ `usePromptContext` manages form state + `getTokenData()` builds `TokenMetadata`
- ✅ RainbowKit + wagmi connected (BSC chain)
- ⚠️ `createTokenTx()` in `lib/utils.ts` → **throws "not yet implemented"**
- ⚠️ `getLaunchGateCheck()` in `lib/api.ts` → **stubbed, returns `allowed: true`**
- ⚠️ `createToken()` in `lib/api.ts` → posts to `/launches` but with placeholder data
- ❌ No agent provisioning step after token creation
- ❌ No agent dashboard/management UI

### waifu-core backend (`/launches`)
- ✅ `GET /launches/gate` — validates invite codes against DB
- ✅ `POST /launches` — creates launch record, calls `flap.prepareLaunchPayload()`
- ✅ `GET /launches/:id` — returns launch + preparation data
- ✅ `prepareLaunchPayload()` → builds `newTokenV5` params, encodes tx calldata, returns ready/preparing status
- ✅ FlapClient with real BSC RPC, quote functions, swap preparation
- ✅ Launch schema in DB (draft → approved → submitted → confirmed)
- ❌ No agent provisioning trigger after launch confirmation
- ❌ No milady-cloud API bridge

### milady-cloud backend (port 3000)
- ✅ `POST /api/agents` — queues agent creation (pgboss job → Docker container on VPS node)
- ✅ `GET /api/agents` — list user's agents
- ✅ `GET /api/jobs/:jobId` — poll provisioning status
- ✅ `DELETE /api/agents/:agentId` — queue agent deletion
- ✅ `POST /api/agents/:agentId/restart` — restart container
- ✅ `GET /api/agents/:agentId/logs` — SSE log stream
- ✅ `GET /api/agents/:agentId/credentials` — bridge URL + API key
- ✅ Pairing token system for Web UI access
- ✅ JWT auth (email/password signup)
- ✅ 16 agents running across 2 nodes (0 slots available currently)
- ✅ Full Vercel frontend at milady-cloud.vercel.app

---

## Architecture

```
User Browser
    │
    ├─ waifu.fun (Vercel) ──── API ──── waifu-core (port 3100)
    │   └─ /create flow                      │
    │   └─ /token/:addr page                 ├─ POST /launches → DB + Flap prep
    │   └─ /agent/:id dashboard              ├─ GET /launches/gate → invite check
    │                                        ├─ POST /agent/provision → milady-cloud bridge
    │                                        └─ GET /agent/:id/status → milady-cloud proxy
    │
    └─ BSC Chain ← wagmi writeContract (newTokenV5)
    │
    └─ milady-cloud (port 3000) ── Docker containers on VPS nodes
        ├─ agent-node-1 (37.27.190.196) — 8 slots
        └─ nyx-node (89.167.49.4) — 8 slots
```

### Key Design Decision: waifu-core as the single API gateway

Frontend ONLY talks to waifu-core. waifu-core proxies agent operations to milady-cloud internally via `localhost:3000`. This keeps auth unified (SIWE → waifu-core JWT) and avoids exposing milady-cloud's email/password auth to waifu.fun users.

---

## Subagent Plan (5 workers)

### Worker 1: `w8-launch-gate` — Wire Launch Gate + Token Creation TX
**Branch:** `feat/launch-gate-wire`
**Repo:** `waifu.fun` (frontend)

**Tasks:**
1. Wire `getLaunchGateCheck()` in `api.ts` to call waifu-core `GET /launches/gate?inviteCode=XYZ`
2. Implement `createTokenTx()` in `lib/utils.ts`:
   - Call `POST /launches` with full form data (name, symbol, description, image, salt, buyAmount, curveLimit, etc.)
   - Receive `preparation.txData` + `preparation.portalAddress` + `preparation.estimatedGas`
   - Use wagmi's `writeContract` to send the `newTokenV5` transaction
   - Return `{ contractAddress, txHash }` from tx receipt
3. Update `createToken()` in `api.ts` to post launch confirmation (txHash, contractAddress) back to waifu-core
4. Fix the `LaunchButton.onSubmit()` flow to use the new wired functions
5. Handle error states: insufficient BNB, rejected tx, RPC errors

**Key files:**
- `apps/frontend/src/lib/api.ts` — `getLaunchGateCheck()`, `createToken()`
- `apps/frontend/src/lib/utils.ts` — `createTokenTx()`
- `apps/frontend/src/components/ui/create-token/shared-form-section.tsx` — `LaunchButton`

**Dependencies:** None (can run in parallel)

---

### Worker 2: `w8-agent-bridge` — waifu-core → milady-cloud Bridge Service
**Branch:** `feat/agent-bridge`
**Repo:** `waifu-core`

**Tasks:**
1. Create `apps/api/src/services/agent-cloud.ts` — HTTP client for milady-cloud:
   - `provisionAgent(params)` → POST `http://localhost:3000/api/agents`
   - `getAgentStatus(agentId)` → GET `http://localhost:3000/api/agents/:agentId`
   - `getAgentLogs(agentId)` → GET `http://localhost:3000/api/agents/:agentId/logs`
   - `deleteAgent(agentId)` → DELETE `http://localhost:3000/api/agents/:agentId`
   - `restartAgent(agentId)` → POST `http://localhost:3000/api/agents/:agentId/restart`
   - `getAvailability()` → GET `http://localhost:3000/api/availability`
   - Uses a service account JWT for auth (create milady-cloud user for waifu-core)
2. Create `apps/api/src/routes/agents.ts` — agent API routes:
   - `POST /agents/provision` — provisions agent after successful token launch
     - Input: `{ tokenAddress, agentName, agentConfig, launchId }`
     - Links agent to token in waifu DB via `tokens.agent_id` column
     - Calls milady-cloud to provision
     - Returns `{ agentId, jobId, status }`
   - `GET /agents/:agentId` — proxy status from milady-cloud
   - `GET /agents/:agentId/logs` — proxy SSE logs
   - `POST /agents/:agentId/restart` — proxy restart
   - `DELETE /agents/:agentId` — proxy delete
   - `GET /agents/availability` — proxy availability check
3. Add `agent_id` column to `tokens` table (nullable, references milady-cloud agent)
4. Register routes in `app.ts`
5. Add `MILADY_CLOUD_URL` and `MILADY_CLOUD_SERVICE_TOKEN` to config

**Key files:**
- New: `apps/api/src/services/agent-cloud.ts`
- New: `apps/api/src/routes/agents.ts`
- Edit: `apps/api/src/app.ts` (register routes)
- Edit: `packages/db/src/schema/tokens.ts` (add agent_id)
- Edit: VPS `.env` (add milady-cloud credentials)

**Dependencies:** None (can run in parallel)

---

### Worker 3: `w8-post-launch` — Post-Launch Agent Provisioning Flow
**Branch:** `feat/post-launch-agent`
**Repo:** `waifu.fun` (frontend)

**Tasks:**
1. Create post-launch provisioning page/modal:
   - After successful `newTokenV5` tx, show "Token created! Setting up your agent..."
   - Call `POST /agents/provision` with token data
   - Poll `GET /agents/:agentId` for status (queued → provisioning → running)
   - Show progress: "Allocating resources..." → "Starting container..." → "Agent is live!"
   - On success: redirect to `/token/{chain}/{chainId}/{address}` with agent status visible
2. Create `AgentStatusBadge` component:
   - Shows agent status with appropriate colors (queued=yellow, provisioning=blue, running=green, failed=red)
   - Appears on token detail page
3. Create `AgentDashboardPanel` component for token detail page:
   - Shows agent status, uptime, web UI link
   - "Open Agent Dashboard" button (links to `{agentId}.shad0w.xyz`)
   - "View Logs" expandable section
   - "Restart Agent" button
   - Only visible to token creator (compare connected wallet to creator address)
4. Add agent provisioning step to `LaunchButton.onSubmit()` after tx confirmation
5. Add API functions to `api.ts`:
   - `provisionAgent(tokenAddress, agentName, agentConfig)`
   - `getAgentStatus(agentId)`
   - `restartAgent(agentId)`
   - `getAgentAvailability()`

**Key files:**
- New: `apps/frontend/src/components/ui/agent/AgentStatusBadge.tsx`
- New: `apps/frontend/src/components/ui/agent/AgentDashboardPanel.tsx`
- New: `apps/frontend/src/components/ui/agent/ProvisioningModal.tsx`
- Edit: `apps/frontend/src/lib/api.ts` (add agent API functions)
- Edit: `apps/frontend/src/components/ui/create-token/shared-form-section.tsx` (post-launch flow)
- Edit: token detail page (add agent panel)

**Dependencies:** Worker 2 defines the API shape. But can be built in parallel using the documented API contract above.

---

### Worker 4: `w8-milady-service-account` — milady-cloud Service Account + Capacity
**Branch:** `feat/waifu-service-account`
**Repo:** `milady-cloud` (local + VPS deploy)

**Tasks:**
1. Create a waifu-core service account in milady-cloud DB:
   - User: `waifu-core-service@internal`
   - High quota limit (100+ agents)
   - Generate long-lived JWT token
2. Add CORS entry for waifu-core (localhost:3100) — actually not needed since it's server-to-server, but add to allowedOrigins just in case
3. Review and fix capacity tracking:
   - Currently shows 0 available / 16 used — verify if this is accurate or a tracking bug
   - If nodes have more capacity, update `cloud_nodes` capacity values
   - Add a mechanism to reclaim slots from stopped/failed agents
4. Add health check that waifu-core can poll: `GET /health` already exists, add `/api/internal/status` with node details
5. Document the service account token in waifu-core's `.env` template

**Key files:**
- `backend/routes/auth.ts` — service account creation
- `backend/services/node-manager.ts` — capacity tracking
- `backend/db/client.ts` — direct DB operations for service account
- VPS: `/opt/milady-cloud/backend/.env`
- VPS: `/opt/waifu-core/.env`

**Dependencies:** None (can run in parallel). Worker 2 needs the service token output.

---

### Worker 5: `w8-create-redesign` — Create Page UX Refresh (waifu-branded)
**Branch:** `feat/create-redesign`
**Repo:** `waifu.fun` (frontend)

**Tasks:**
1. Add "Agent Configuration" step to the create flow (between configure and deploy):
   - Agent name (defaults to token name)
   - Agent bio/personality prompt
   - Platform connections: Discord toggle, Twitter toggle (visual only for now)
   - Model selection dropdown: GPT-4o (default), Claude Sonnet, GPT-5-mini
   - Show "Capacity Available: X slots" from `/agents/availability`
2. Redesign the step progress to 4 steps:
   - Choose Mode → Configure Token → Configure Agent → Deploy
3. Add agent config to `usePromptContext`:
   - New fields: `agentBio`, `agentPlatforms`, `agentModel`
   - Pass to `getTokenData()` output
4. Update FAQ section with agent-related questions:
   - "What is an agent?" → Autonomous AI that represents your token
   - "How do I manage my agent?" → Dashboard on token page after launch
   - "What can agents do?" → Chat, tweet, trade (future)
5. Style consistency: ensure all new UI uses `#00ff87` accent, `#08080a` background, cyberpunk monospace aesthetic

**Key files:**
- New: `apps/frontend/src/components/ui/create-token/agent-config-section.tsx`
- Edit: `apps/frontend/src/components/ui/create-token/step-progress.tsx` (4 steps)
- Edit: `apps/frontend/src/app/create/page.tsx` (add agent step)
- Edit: `apps/frontend/src/components/hooks/providers/usePromptContext.tsx` (agent fields)
- Edit: `apps/frontend/src/components/ui/create-token/faq-accordion.tsx`

**Dependencies:** None (pure frontend, can run in parallel)

---

## Execution Order

All 5 workers start simultaneously. No blocking dependencies.

After merge:
1. Deploy waifu-core with agent bridge (Worker 2)
2. Set up service account on VPS (Worker 4 output)
3. Deploy frontend (Workers 1, 3, 5)
4. E2E test: wallet → invite → configure → deploy → agent provisioning

---

## Pre-flight Checks (Before Starting Workers)

- [ ] Verify milady-cloud capacity: are 16/16 slots genuinely used or are some ghost containers?
- [ ] Create milady-cloud service account manually on VPS
- [ ] Test milady-cloud agent creation via curl to confirm the flow works
- [ ] Confirm `POST /launches` endpoint works on production waifu-core

---

## Risk Mitigations

1. **Zero capacity on milady-cloud** — 16/16 slots used. Either clean up unused agents or add a third node. Worker 4 addresses this.
2. **Auth mismatch** — waifu.fun uses SIWE (wallet signatures), milady-cloud uses email/password. Solution: waifu-core acts as proxy with a service account.
3. **Two Postgres databases** — waifu-core uses `waifu` DB, milady-cloud uses `milady_cloud` DB. Both on the same Postgres instance. No schema conflicts.
4. **Agent creation race** — User creates token on-chain but agent provisioning fails. Solution: show clear status, allow retry from token page.
5. **`createTokenTx` not implemented** — This is the #1 blocker. Worker 1 handles it.

---

## File Reference

### waifu.fun repo
- `apps/frontend/src/lib/utils.ts:295` — `createTokenTx()` (STUB — throws)
- `apps/frontend/src/lib/api.ts:362` — `getLaunchGateCheck()` (STUB — returns true)
- `apps/frontend/src/lib/api.ts:337` — `createToken()` (posts placeholder to /launches)
- `apps/frontend/src/components/ui/create-token/shared-form-section.tsx` — `LaunchButton` component
- `apps/frontend/src/components/hooks/providers/usePromptContext.tsx:525` — `getTokenData()`
- `apps/frontend/src/app/create/page.tsx` — create page with invite gate

### waifu-core repo
- `apps/api/src/routes/launches.ts` — launch endpoints (gate, create, get)
- `apps/api/src/services/flap-client.ts` — `prepareLaunchPayload()` with real BSC encoding
- `packages/db/src/schema/launches.ts` — launch DB schema

### milady-cloud repo
- `backend/routes/agents.ts` — full agent CRUD + provisioning
- `backend/services/container-orchestrator.ts` — Docker SSH provisioning
- `backend/services/job-queue.ts` — pgboss async jobs
- `backend/services/node-manager.ts` — capacity tracking
- `backend/server.ts` — Express app setup
- `src/api.ts` — frontend API client (reference for bridge implementation)
