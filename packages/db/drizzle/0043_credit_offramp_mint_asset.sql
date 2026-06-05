ALTER TABLE "credit_offramp_mints"
	ADD COLUMN IF NOT EXISTS "asset" text NOT NULL DEFAULT 'BNB';--> statement-breakpoint
ALTER TABLE "credit_offramp_mints"
	DROP CONSTRAINT IF EXISTS "credit_offramp_mints_asset_check";--> statement-breakpoint
ALTER TABLE "credit_offramp_mints"
	ADD CONSTRAINT "credit_offramp_mints_asset_check" CHECK ("asset" IN ('BNB', 'USDT'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_offramp_mints_by_asset" ON "credit_offramp_mints" USING btree ("asset");
