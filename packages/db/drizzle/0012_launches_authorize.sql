-- W6.2 launch authorization lifecycle fields.
-- Idempotent: safe to apply after older branches with partial launches schema changes.

ALTER TABLE "launches"
  ADD COLUMN IF NOT EXISTS "agent_id" text,
  ADD COLUMN IF NOT EXISTS "creator_address" text,
  ADD COLUMN IF NOT EXISTS "tax_recipient_address" text,
  ADD COLUMN IF NOT EXISTS "first_buy_wei" text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "launch_authorized_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "launch_authorized_by" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_launches_agent_id"
  ON "launches" USING btree ("agent_id")
  WHERE "agent_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_launches_tax_recipient"
  ON "launches" USING btree ("tax_recipient_address")
  WHERE "tax_recipient_address" IS NOT NULL;
--> statement-breakpoint
