# Mongo → canonical Supabase control-plane backfill

This repo now includes an idempotent backfill command for migrating legacy control-plane state out of Mongo and into the canonical `control_plane_*` foundation from PR #339.

## Before you run it

1. Apply the canonical Supabase migration first:
   - `supabase/migrations/202603070001_control_plane_foundation.sql`
2. Set `MONGO_URI` to the source waifu Mongo database.
3. Set `SUPABASE_DATABASE_URL` (preferred) or `DATABASE_URL` to the destination Postgres database.

## Preview without writing

- `pnpm --filter @waifufun/sync sync control-plane --dry-run`
- add `--limit 25` for a small validation slice

## Full backfill

- `pnpm --filter @waifufun/sync sync control-plane`

## What gets populated

- `public.control_plane_wallet_identities`
- `public.control_plane_token_ownerships`
- `public.control_plane_token_runtime_states`
- `public.control_plane_launch_gate_allowlist`
- `public.control_plane_invite_codes`
- `public.control_plane_invite_redemptions`

## Important mapping notes

- Legacy Mongo `users` are **not** converted into synthetic `control_plane_users` rows. The canonical `users` table is auth-centric, so this backfill seeds wallet identities instead and preserves legacy profile/admin fields in metadata.
- Legacy token fields that no longer have first-class canonical columns (for example owner wallet arrays, character config, some runtime history) are preserved in canonical JSON metadata rather than a parallel schema.
- Writes are UPSERTs, so reruns are safe.
- Existing canonical rows win when they already contain richer/live data; the backfill mainly fills gaps and preserves Mongo provenance.
- Legacy wallet-only records default to Solana `101` and EVM `8453` unless overridden with `--default-solana-chain-id` / `--default-evm-chain-id`.
