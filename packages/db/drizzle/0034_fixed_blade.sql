CREATE TABLE "agent_apps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_token_address" text NOT NULL,
	"app_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"app_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"shipped_at" timestamp with time zone,
	"revenue_lifetime_usd" numeric DEFAULT '0',
	"revenue_24h_usd" numeric DEFAULT '0',
	"revenue_7d_usd" numeric DEFAULT '0',
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_agent_apps_agent_app" ON "agent_apps" USING btree ("agent_token_address","app_id");--> statement-breakpoint
CREATE INDEX "idx_agent_apps_revenue7d" ON "agent_apps" USING btree ("agent_token_address","revenue_7d_usd" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "agent_apps" ("agent_token_address", "app_id", "name", "description", "status", "metadata")
VALUES
	('0x15fc6086064afe50ccf4c70000c55cecb6e17777', 'twitter-replies', 'twitter replies', 'Sol replies to mentions on @0xSolace_', 'scheduled', '{}'),
	('0x15fc6086064afe50ccf4c70000c55cecb6e17777', 'trading-perps', 'hyperliquid trading', 'Sol places perp trades within policy bounds', 'scheduled', '{}'),
	('0x15fc6086064afe50ccf4c70000c55cecb6e17777', 'predictions', 'polymarket positions', 'Sol takes positions on prediction markets', 'scheduled', '{}'),
	('0x15fc6086064afe50ccf4c70000c55cecb6e17777', 'content', 'twitter posts', 'Sol writes long-form posts via Eliza Cloud', 'scheduled', '{}')
ON CONFLICT ("agent_token_address", "app_id") DO NOTHING;