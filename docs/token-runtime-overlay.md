# Token runtime overlay contract

This backend now supports composing Mongo-backed token market data with a Supabase/PostgREST runtime overlay.

## Why

Mongo remains the source for token/market payloads already used by the app.
Supabase/Postgres can now supply the control-plane/runtime fields without requiring those fields to be persisted back onto the Mongo token document.

## Backend contract

When these env vars are set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional `SUPABASE_TOKEN_RUNTIME_VIEW`

backend token reads will query a PostgREST relation and overlay the returned runtime fields onto token responses.

If `SUPABASE_TOKEN_RUNTIME_VIEW` is not set, the backend tries these relation names in order:

1. `waifufun_token_runtime_overlay`
2. `token_runtime_overlay`
3. `token_runtime_overlays`

If no relation exists yet, token reads fall back to pure Mongo responses.

## Expected columns

The PostgREST relation should expose one row per token lookup key:

- `chain` text
- `chain_id` integer
- `contract_address` text

Optional overlay fields:

- `launch_type`
- `launch_platform`
- `owner_claim_status`
- `creator_user_id`
- `owner_wallets` jsonb
- `agent_character_config` jsonb
- `cloud_agent_id`
- `agent_status`
- `agent_lifecycle_state`
- `billing_mode`
- `infra_reserve_usd`
- `last_trade_at`
- `suspend_at`
- `revive_at`
- `web_ui_url`

## Example view shape

```sql
create or replace view public.token_runtime_overlay as
select
  t.chain,
  t.chain_id,
  t.contract_address,
  t.launch_type,
  t.launch_platform,
  t.owner_claim_status,
  t.creator_user_id,
  t.owner_wallets,
  t.agent_character_config,
  t.cloud_agent_id,
  t.agent_status,
  t.agent_lifecycle_state,
  t.billing_mode,
  t.infra_reserve_usd,
  t.last_trade_at,
  t.suspend_at,
  t.revive_at,
  t.web_ui_url
from public.token_runtime_projection t;
```

The backend does not care whether this is a table, view, or materialized view, as long as PostgREST can `select` from it using the key columns above.
