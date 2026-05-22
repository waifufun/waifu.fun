CREATE TABLE "nav_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_token_address" text NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"nav_usd" numeric NOT NULL,
	"priced_nav_usd" numeric,
	"unpriced_count" integer DEFAULT 0 NOT NULL,
	"by_chain" jsonb,
	"by_role" jsonb,
	"wallet_count" integer DEFAULT 0 NOT NULL,
	"holdings_count" integer DEFAULT 0 NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_nav_snapshots_agent_time" ON "nav_snapshots" USING btree ("agent_token_address","snapshot_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_nav_snapshots_agent_hour" ON "nav_snapshots" USING btree ("agent_token_address",date_trunc('hour', "snapshot_at" at time zone 'UTC'));
