-- Wave M4: persist TaxSplitter + AgentSafe launch metadata on legacy launches.
-- Backfill: existing Wave H rows remain NULL (no splitter/safe deployed).

ALTER TABLE "launches" ADD COLUMN IF NOT EXISTS "tax_splitter_address" text;
ALTER TABLE "launches" ADD COLUMN IF NOT EXISTS "agent_safe_address" text;
ALTER TABLE "launches" ADD COLUMN IF NOT EXISTS "platform_bps" integer;
ALTER TABLE "launches" ADD COLUMN IF NOT EXISTS "patron_bps" integer;
ALTER TABLE "launches" ADD COLUMN IF NOT EXISTS "agent_safe_owners" jsonb;
ALTER TABLE "launches" ADD COLUMN IF NOT EXISTS "agent_safe_threshold" integer;

CREATE INDEX IF NOT EXISTS "idx_launches_agent_safe"
  ON "launches" ("agent_safe_address")
  WHERE "agent_safe_address" IS NOT NULL;

-- Active LaunchFactory v2 routes persist rows in agent_launches.
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "agent_safe_address" varchar(42);
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "platform_bps" integer;
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "patron_bps" integer;
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "agent_safe_owners" jsonb;
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "agent_safe_threshold" integer;

CREATE INDEX IF NOT EXISTS "idx_agent_launches_agent_safe"
  ON "agent_launches" ("agent_safe_address")
  WHERE "agent_safe_address" IS NOT NULL;
