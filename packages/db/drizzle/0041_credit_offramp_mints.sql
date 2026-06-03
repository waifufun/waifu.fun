CREATE TABLE IF NOT EXISTS "credit_offramp_mints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deposit_tx_hash" text NOT NULL,
	"agent_token_address" text,
	"safe_address" text,
	"deposit_bnb" numeric,
	"convert_bnb" numeric,
	"usd_amount" numeric NOT NULL,
	"bnb_price_usd" numeric,
	"offramp_tx_hash" text,
	"eliza_payment_id" text,
	"credits_added" text,
	"resulting_balance" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "credit_offramp_mints_status_check" CHECK ("credit_offramp_mints"."status" IN ('pending', 'credited', 'capped', 'killed', 'failed', 'skipped'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_offramp_mints_active_deposit_unique" ON "credit_offramp_mints" USING btree ("deposit_tx_hash") WHERE "credit_offramp_mints"."status" IN ('pending', 'credited');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_offramp_mints_by_deposit_tx_hash" ON "credit_offramp_mints" USING btree ("deposit_tx_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_offramp_mints_by_created_at" ON "credit_offramp_mints" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_offramp_mints_by_status" ON "credit_offramp_mints" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_offramp_mints_by_agent" ON "credit_offramp_mints" USING btree ("agent_token_address");
