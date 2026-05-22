CREATE TABLE "twitter_stats" (
	"handle" text PRIMARY KEY NOT NULL,
	"followers" integer,
	"following" integer,
	"tweets" integer,
	"source" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "uniq_nav_snapshots_agent_hour";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_nav_snapshots_agent_hour" ON "nav_snapshots" USING btree ("agent_token_address",date_trunc('hour', "snapshot_at" at time zone 'UTC'));