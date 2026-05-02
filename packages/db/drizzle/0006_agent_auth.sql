-- Wave 2a: agent API keys (gates POST /v2/agents/launch)
-- Run manually: psql $DATABASE_URL -f drizzle/0006_agent_auth.sql

CREATE TABLE IF NOT EXISTS "agent_api_keys" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id"      varchar(128) NOT NULL REFERENCES "agent_personas"("agent_id") ON DELETE CASCADE,
  "key_hash"      text        UNIQUE NOT NULL,
  "key_prefix"    varchar(12) NOT NULL,
  "scopes"        text[]      NOT NULL DEFAULT '{"launch:*"}',
  "created_at"    timestamptz NOT NULL DEFAULT NOW(),
  "revoked_at"    timestamptz,
  "last_used_at"  timestamptz
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_agent_api_keys_agent_id" ON "agent_api_keys" ("agent_id");
--> statement-breakpoint

-- Enforce one active (non-revoked) key per agent
CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_api_keys_active"
  ON "agent_api_keys" ("agent_id")
  WHERE "revoked_at" IS NULL;
