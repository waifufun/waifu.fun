ALTER TABLE "agent_personas"
  ADD COLUMN IF NOT EXISTS "runtime_kind" text,
  ADD COLUMN IF NOT EXISTS "runtime_api_key_hash" text,
  ADD COLUMN IF NOT EXISTS "runtime_last_seen_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_personas_runtime_api_key_hash"
  ON "agent_personas" ("runtime_api_key_hash")
  WHERE "runtime_api_key_hash" IS NOT NULL;
