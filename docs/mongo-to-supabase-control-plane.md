# Mongo → Supabase control-plane backfill

This repo now includes an idempotent backfill command for the waifu.fun control-plane state that still lives in Mongo.

## Execution order

1. Set `MONGO_URI` to the source waifu Mongo database.
2. Set `DATABASE_URL` or `SUPABASE_DATABASE_URL` to the destination Postgres/Supabase database.
3. Preview the row counts without writing anything:
   - `pnpm --filter @waifufun/sync sync control-plane --dry-run`
4. Create/ensure the target schema + tables and perform the backfill:
   - `pnpm --filter @waifufun/sync sync control-plane --apply-ddl`

## What gets backfilled

- `waifu.users`
- `waifu.token_control_plane`
- `waifu.runtime_agents`
- `waifu.launch_gate_allowlist`
- `waifu.invite_codes`
- `waifu.invite_code_redemptions`

## Notes

- Writes are UPSERTs, so the job is safe to re-run.
- `--dry-run` never writes DDL or data; use it only for validation/planning.
- Creator linkage is resolved by matching `token.creator` to a Mongo `users.address` wallet when possible.
- Invite redemptions are timestamped only when Mongo has an explicit redemption object. If Mongo only has `usedBy`, the wallet linkage is preserved and `redeemed_at` remains null.
- Runtime rows merge token fields and agent collection fields over the same `(chain, chain_id, contract_address)` identity.
