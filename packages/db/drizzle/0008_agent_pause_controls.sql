-- W1.8: per-agent moderation pause/kill controls.
-- Nullable by design: NULL means the scope is active/not killed.

ALTER TABLE "agent_personas"
  ADD COLUMN IF NOT EXISTS "brain_paused_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "brain_paused_reason" text,
  ADD COLUMN IF NOT EXISTS "withdrawals_paused_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "withdrawals_paused_reason" text,
  ADD COLUMN IF NOT EXISTS "killed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "killed_reason" text;
