# Agent Economics Vision — Token Detail Page

**Author:** Opus 4.6 subagent  
**Date:** 2026-03-13  
**Status:** Proposal for review

---

## The Problem

The current `TreasuryReadOnlyCard` is weak:

1. **Vague framing** — "treasury" implies holdings that don't exist; "runtime funds and operator footprint" is confusing.
2. **Misleading fields** — Shows `infra_reserve_usd` when it's often null; shows `billing_mode` that nobody understands; shows wallet counts without balances.
3. **"Partial data" badge** — Admission of defeat. If the data is partial, show only what's real.
4. **No economic truth** — Doesn't answer: "Is this agent funded? What does it cost to run? What has it earned?"

The user has already rejected corny naming. Any replacement must be blunt, accurate, and product-defining.

---

## What Users Actually Want to Know

### Public viewers
1. **Is this agent solvent?** Can it keep running or will it die?
2. **What's the runway?** Days/weeks until shutdown if unfunded.
3. **Is the creator active?** Recent activity, last heartbeat, claim status.

### Creators (owner-only)
1. **What am I spending?** Daily burn rate in USD.
2. **What have I earned?** Trading fees collected (pre-migration only, post-migration goes to Raydium/Meteora).
3. **What do I control?** Wallet balances, reserve status.
4. **How long can I run?** Runway calculation.

---

## Data Audit: What Exists vs What's Missing

### Currently available (control plane + API)

| Field | Source | Notes |
|-------|--------|-------|
| `infra_reserve_usd` | control_plane_token_runtime_states | Often null; only set when owner activates with credits |
| `billing_mode` | control_plane_token_runtime_states | `owner_credits`, `waifu_treasury_subsidy`, `hybrid` |
| `agent_status` | control_plane_token_runtime_states | `none`, `provisioning`, `running`, `suspended`, `failed`, `deleted` |
| `last_heartbeat_at` | control_plane_token_runtime_states | Set by milady-cloud; can be stale |
| `suspended_at` / `resumed_at` | control_plane_token_runtime_states | Timestamps for state transitions |
| `owner_claim_status` | control_plane_token_ownerships | `unclaimed`, `claimed`, `verified`, `disputed` |
| `creator_wallet_identity_id` | control_plane_token_ownerships | FK to wallet_identities |
| `owner_wallet_identity_id` | control_plane_token_ownerships | FK to wallet_identities |

### Available from milady-cloud but NOT exposed publicly

The `/billing` owner endpoint already fetches from milady-cloud:
```typescript
const usage = await miladyCloud.getAgentUsage(context.runtime.cloudAgentId);
// Returns:
// - estimatedDailyBurnUsd
// - currentPeriodCostUsd
// - fundingSource
```

This is gold. It's just hidden behind the owner auth wall.

### Missing entirely

| Field | Why it matters | Action required |
|-------|----------------|-----------------|
| `fees_collected_total_usd` | Pre-migration tokens earn trading fees; creators want to see them | Backend: aggregate from indexer events |
| `last_trade_at` | Shows market activity | Already in IToken but often null; backfill from indexer |
| `wallet_balances` | Real SOL/token balances in operator wallets | On-chain read; expensive, cache aggressively |
| `runway_days` | Calculated field: reserve / daily_burn | Frontend calculation from existing fields |

---

## Proposed Replacement

### Kill "Treasury" — Use "Agent Economics"

The word "treasury" implies a fund the agent manages. That's not what this is. This is **cost-of-running** and **creator economics**. Rename to:

- **Section label:** `economics`
- **Card header:** `runtime cost and operator status`
- **No corny subtitle**

### Public-facing card: `RuntimeEconomicsCard`

Show only what we can prove. Three blocks:

#### Block 1: "operational status"
- Agent status badge (running/stopped/etc)
- Last heartbeat (if known): "active 2h ago" or "unknown"
- Claim status: "unclaimed" / "claimed by 0x3f..." / "verified"

#### Block 2: "funding" (conditional)
- If `billing_mode` is known and `infra_reserve_usd` exists:
  - Show reserve balance
  - Show billing mode in plain language:
    - `owner_credits` → "creator-funded"
    - `waifu_treasury_subsidy` → "platform-subsidized"
    - `hybrid` → "shared funding"
- If unknown, don't show the block at all. No "not reported" placeholders.

#### Block 3: "runway estimate" (calculated)
- Only show if we have both reserve and burn rate
- Format: "~12 days at current burn" or "suspended"
- If data insufficient: hide entirely

**Design principle:** Empty fields should collapse the block, not show "unavailable".

### Creator-only card: `OwnerEconomicsPanel`

Expanded version with sensitive data. Only renders for authenticated owner.

#### Block 1: "spending"
- Daily burn rate (from milady-cloud)
- Current period cost
- Funding source

#### Block 2: "earnings" (pre-migration only)
- Total fees collected (requires backend work)
- Last fee claim date
- Claim button if eligible

#### Block 3: "reserve"
- Current balance
- Runway estimate
- Top-up action (future)

#### Block 4: "wallets"
- Creator wallet address
- Owner wallet address (if different)
- Future: actual balances

---

## Implementation Targets

### Frontend files to modify

| File | Action |
|------|--------|
| `apps/frontend/src/components/token-page/treasury-read-only-card.tsx` | **Delete or replace with `RuntimeEconomicsCard`** |
| `apps/frontend/src/components/token-page/owner-runtime-panel.tsx` | **Absorb economics data into `OwnerEconomicsPanel`** (or keep separate and co-locate) |
| `apps/frontend/src/app/token/[chain]/[chainId]/[contractAddress]/components/page-client.tsx` | Update imports and placement |
| `apps/frontend/src/lib/api.ts` | Add `getTokenEconomics()` if we create a new endpoint |

### Backend files to modify

| File | Action |
|------|--------|
| `apps/backend/src/routers/owner.ts` | Expose `estimatedDailyBurnUsd`, `currentPeriodCostUsd` in runtime response |
| `apps/backend/src/routers/owner.ts` | Add optional `fees_collected_total_usd` if indexer can provide |
| `packages/control-plane/src/token-runtime.ts` | Add runway calculation helper |

### Schema additions (future)

If we want `fees_collected_total_usd`:
- Add column to `control_plane_token_runtime_states`
- Backfill from indexer trade events
- Update on each claim

---

## What NOT to Do

1. **Don't show "not reported" for every field** — Either the data exists or the block doesn't render.
2. **Don't use "treasury"** — It implies holdings we don't have visibility into.
3. **Don't show wallet addresses without balances** — It's misleading. Either show the balance or just say "creator-managed".
4. **Don't invent runway if we lack burn rate** — Show "unknown" or hide.
5. **Don't add corny names** — "runtime economics" or "agent cost" is fine. Not "the vault" or "power reserves".

---

## Implementation Order

### Phase 1: Honest reframe (no backend changes)
1. Rename card from "treasury" to "runtime economics"
2. Remove fields that are almost always null
3. Collapse empty blocks instead of showing placeholders
4. Keep existing `infra_reserve_usd`, `billing_mode`, `agent_status` where available

### Phase 2: Expose milady-cloud billing to owner panel
1. Modify `/runtime` or `/billing` endpoint to return burn rate, period cost
2. Add `OwnerEconomicsPanel` with spending block
3. Calculate and display runway when data exists

### Phase 3: Fees and earnings (requires indexer work)
1. Backend: Aggregate trading fee data from indexer
2. Add `fees_collected_total_usd` to runtime state
3. Show in owner panel only
4. Wire up to existing ClaimFees component

### Phase 4: Wallet balance reads (optional, expensive)
1. On-chain balance lookup for operator wallets
2. Cache aggressively (5min minimum)
3. Show in owner panel only

---

## Labels and Copy

### Public card
- Header: `runtime status`
- Blocks: `operational`, `funding`, `runway`

### Creator card
- Header: `economics`
- Blocks: `spending`, `earnings`, `reserve`, `wallets`

### Field labels (plain language)
| Current | Proposed |
|---------|----------|
| `billing_mode: owner_credits` | `funding: creator-funded` |
| `billing_mode: waifu_treasury_subsidy` | `funding: platform-subsidized` |
| `billing_mode: hybrid` | `funding: shared` |
| `infra_reserve_usd` | `reserve: $X.XX` |
| `owner_wallets` | `operator wallets` (count only unless we have balances) |
| `lifecycle: live` | `status: running` (use agent_status directly) |

---

## Summary

**Kill the current treasury card.** Replace with:

1. **`RuntimeEconomicsCard`** (public) — operational status, funding mode, runway estimate. Collapses empty blocks.
2. **`OwnerEconomicsPanel`** (creator-only) — spending, earnings, reserve, wallets. Integrates milady-cloud billing data.

Backend additions:
- Expose `estimatedDailyBurnUsd` and `currentPeriodCostUsd` from milady-cloud in owner endpoints
- Future: aggregate `fees_collected_total_usd` from indexer

No corny names. No "partial data" excuses. Either show real data or don't render the block.

---

## Decision Points for Product Owner

1. **Should runway estimates be public or creator-only?** (Proposal: public if data exists)
2. **Should we pursue fee aggregation from indexer?** (Adds value but requires indexer work)
3. **Should wallet balances ever be public?** (Proposal: no, creator-only)
4. **Is "runtime economics" acceptable or do you want something else?** (Alternatives: "agent cost", "operations", "economics")
