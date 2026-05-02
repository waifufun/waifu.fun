-- W1.6: per-agent X OAuth accounts with encrypted token envelopes.
-- Run manually: psql $DATABASE_URL -f drizzle/0008_agent_x_accounts.sql

CREATE TABLE IF NOT EXISTS "agent_x_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" text NOT NULL UNIQUE REFERENCES "agent_personas"("agent_id") ON DELETE CASCADE,
  "x_user_id" text NOT NULL,
  "x_handle" text NOT NULL,
  "x_display_name" text,
  "x_avatar_url" text,
  "encrypted_access_token" jsonb NOT NULL,
  "encrypted_refresh_token" jsonb,
  "scope" text NOT NULL,
  "token_expires_at" timestamptz,
  "last_refreshed_at" timestamptz,
  "refresh_failure_count" text DEFAULT '0',
  "authorized_by_patron_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_agent_x_accounts_x_user_id"
  ON "agent_x_accounts" ("x_user_id");
