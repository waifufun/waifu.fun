-- W6.3 support columns for patron-authorized launches.
-- W6.2 lifecycle state may not have landed in this worktree, so this migration
-- also extends the enum idempotently for provisioned -> queued launch flow.
ALTER TYPE "public"."launch_status" ADD VALUE IF NOT EXISTS 'provisioned';
ALTER TYPE "public"."launch_status" ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE "public"."launch_status" ADD VALUE IF NOT EXISTS 'launching';
ALTER TYPE "public"."launch_status" ADD VALUE IF NOT EXISTS 'live';

ALTER TABLE "launches"
  ADD COLUMN IF NOT EXISTS "agent_id" uuid REFERENCES "public"."agent_personas"("id"),
  ADD COLUMN IF NOT EXISTS "first_buy_wei" text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "launch_authorized_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "launch_authorized_by" text;

CREATE INDEX IF NOT EXISTS "idx_launches_agent_id" ON "launches" ("agent_id");
