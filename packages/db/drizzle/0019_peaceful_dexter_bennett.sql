ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "launchpad_id" text;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "launchpad_config" jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "chain" text;--> statement-breakpoint
ALTER TABLE "agent_safes" ADD COLUMN IF NOT EXISTS "chain" text;--> statement-breakpoint
UPDATE "agent_safes" SET "chain" = 'bsc' WHERE "chain" IS NULL;--> statement-breakpoint
ALTER TABLE "agent_safes" ALTER COLUMN "chain" SET DEFAULT 'bsc';--> statement-breakpoint
ALTER TABLE "agent_safes" ALTER COLUMN "chain" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_safes" ADD COLUMN IF NOT EXISTS "zodiac_modifier_address" text;--> statement-breakpoint
UPDATE "agent_safes" SET "zodiac_modifier_address" = "roles_modifier_address" WHERE "zodiac_modifier_address" IS NULL;--> statement-breakpoint
ALTER TABLE "agent_safes" ADD COLUMN IF NOT EXISTS "agent_role_id" text;--> statement-breakpoint
ALTER TABLE "agent_safes" ADD COLUMN IF NOT EXISTS "patron_role_id" text;--> statement-breakpoint
ALTER TABLE "agent_safes" ALTER COLUMN "chain_id" SET DEFAULT 56;--> statement-breakpoint
UPDATE "agent_safes" SET "chain_id" = 56 WHERE "chain_id" IS NULL;--> statement-breakpoint
ALTER TABLE "agent_safes" ALTER COLUMN "chain_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "agent_safes_agent_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_safes_agent_id_chain_unique" ON "agent_safes" USING btree ("agent_id","chain");--> statement-breakpoint
ALTER TABLE "agent_safes" DROP CONSTRAINT IF EXISTS "agent_safes_agent_id_agent_personas_id_fk";--> statement-breakpoint
ALTER TABLE "agent_safes" ADD CONSTRAINT "agent_safes_agent_id_agent_personas_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_fees_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"amount_wei" text NOT NULL,
	"token_address" text NOT NULL,
	"chain" text NOT NULL,
	"source" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "platform_fees_ledger_source_check" CHECK ("platform_fees_ledger"."source" in ('curve-trade', 'post-grad-tax', 'manual'))
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform_fees_ledger" ADD CONSTRAINT "platform_fees_ledger_agent_id_agent_personas_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_personas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_fees_ledger_tx_hash_agent_id_unique" ON "platform_fees_ledger" USING btree ("tx_hash","agent_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "launchpad_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"launchpad_id" text NOT NULL,
	"signed_up_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launchpad_waitlist_email_launchpad_id_unique" ON "launchpad_waitlist" USING btree ("email","launchpad_id");
