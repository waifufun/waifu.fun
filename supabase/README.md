# Supabase control-plane foundation

This repo now includes a first-pass Supabase/Postgres foundation for waifu control-plane data.

## Migration

Apply:

- `supabase/migrations/202603070001_control_plane_foundation.sql`

You can run it with the Supabase SQL editor, `supabase db push`, or any Postgres migration runner already pointed at the project database.

## Environment

Required server-side env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

These tables are intended for **server-side/service-role usage only**. No anon/browser key is required for this foundation.

## Tables created

- `control_plane_users`
- `control_plane_wallet_identities`
- `control_plane_token_ownerships`
- `control_plane_token_runtime_states`
- `control_plane_launch_gate_allowlist`
- `control_plane_invite_codes`
- `control_plane_invite_redemptions`

## Shared package

Use `@waifufun/control-plane` for client creation, normalization, and typed helpers.
