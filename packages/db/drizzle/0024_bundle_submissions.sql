CREATE TABLE IF NOT EXISTS "bundle_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_hash" text NOT NULL,
	"tx_hash" text,
	"raw_tx" text NOT NULL,
	"chain_id" integer NOT NULL DEFAULT 56,
	"status" text NOT NULL DEFAULT 'submitted',
	"path" text NOT NULL DEFAULT 'puissant',
	"block_number" text,
	"fallback_tx_hash" text,
	"deadline" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
	"included_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"fallback_at" timestamp with time zone,
	"last_error" text,
	"attempts" integer NOT NULL DEFAULT 1,
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "bundle_submissions_bundle_hash_unique" UNIQUE("bundle_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bundle_submissions_status" ON "bundle_submissions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bundle_submissions_tx_hash" ON "bundle_submissions" USING btree ("tx_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bundle_submissions_submitted_at" ON "bundle_submissions" USING btree ("submitted_at" DESC);
