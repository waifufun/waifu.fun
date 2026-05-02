ALTER TABLE "patron_wallets" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'linked_eoa';--> statement-breakpoint
ALTER TABLE "patron_wallets" ADD COLUMN IF NOT EXISTS "added_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "patron_wallets" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patron_wallets" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
UPDATE "patron_wallets"
SET "kind" = CASE WHEN "is_primary" THEN 'steward_primary' ELSE 'linked_eoa' END,
    "added_at" = COALESCE("linked_at", "added_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patron_wallets_patron_kind_idx" ON "patron_wallets" USING btree ("patron_id", "kind");
