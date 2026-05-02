-- Claim flow (v3 pivot): agents prepare launches, humans claim via X + fund, launch broadcasts.
-- Run manually: psql $DATABASE_URL -f drizzle/0007_claim_flow.sql
--
-- Note: we use enum name `agent_launch_status` to avoid conflict with the
-- existing `launch_status` type used elsewhere in the schema.

-- 1. enum -----------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "agent_launch_status" AS ENUM (
    'prepared',   -- agent called /prepare, four.meme createArg cached, waiting on claim
    'claimed',    -- human clicked link, signed in with X, attribution recorded
    'launched',   -- tx broadcast, token live
    'expired',    -- claim_expires_at passed before claim
    'cancelled'   -- manually invalidated
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 2. extend agent_personas with claim + prelaunch fields ------------------
ALTER TABLE "agent_personas"
  ADD COLUMN IF NOT EXISTS "agent_launch_status"     "agent_launch_status",
  ADD COLUMN IF NOT EXISTS "claim_token_hash"        varchar(64),
  ADD COLUMN IF NOT EXISTS "claim_expires_at"        timestamptz,
  ADD COLUMN IF NOT EXISTS "claimed_by_x_user_id"    varchar(64),
  ADD COLUMN IF NOT EXISTS "claimed_by_x_handle"     varchar(64),
  ADD COLUMN IF NOT EXISTS "claimed_at"              timestamptz,
  ADD COLUMN IF NOT EXISTS "launched_at"             timestamptz,
  ADD COLUMN IF NOT EXISTS "launch_tx_hash"          varchar(66),
  -- prelaunch cache: stored four.meme artifacts ready to broadcast
  ADD COLUMN IF NOT EXISTS "prelaunch_params"        jsonb,
  ADD COLUMN IF NOT EXISTS "prelaunch_create_arg"    text,
  ADD COLUMN IF NOT EXISTS "prelaunch_signature"     text,
  -- tax config (four.meme tokenTaxInfo): fee_rate in {1,3,5,10}; splits sum to 100
  ADD COLUMN IF NOT EXISTS "tax_fee_rate"            integer,
  ADD COLUMN IF NOT EXISTS "tax_recipient_address"   varchar(42),
  ADD COLUMN IF NOT EXISTS "tax_config"              jsonb;
--> statement-breakpoint

-- Backfill agent_launch_status for existing rows:
--   tokens already on-chain → 'launched'
--   everything else → 'prepared' (safe default for dev; new flow writes
--   these explicitly)
UPDATE "agent_personas"
SET "agent_launch_status" = 'launched'
WHERE "token_address" IS NOT NULL AND "agent_launch_status" IS NULL;
--> statement-breakpoint

UPDATE "agent_personas"
SET "agent_launch_status" = 'prepared'
WHERE "token_address" IS NULL AND "agent_launch_status" IS NULL;
--> statement-breakpoint

-- 3. indexes --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_agent_personas_agent_launch_status"
  ON "agent_personas" ("agent_launch_status");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_personas_claim_token"
  ON "agent_personas" ("claim_token_hash")
  WHERE "claim_token_hash" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_agent_personas_claimed_by_x"
  ON "agent_personas" ("claimed_by_x_handle")
  WHERE "claimed_by_x_handle" IS NOT NULL;
--> statement-breakpoint
