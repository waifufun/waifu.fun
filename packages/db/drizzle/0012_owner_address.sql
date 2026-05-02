-- W6.3: patron wallet linked to an agent persona/Safe.
-- Nullable: legacy demo agents may not have a patron owner.
ALTER TABLE "agent_personas"
  ADD COLUMN IF NOT EXISTS "owner_address" text;

CREATE INDEX IF NOT EXISTS "idx_agent_personas_owner_address"
  ON "agent_personas" (lower("owner_address"))
  WHERE "owner_address" IS NOT NULL;
