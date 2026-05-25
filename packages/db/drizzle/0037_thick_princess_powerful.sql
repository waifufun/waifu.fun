ALTER TABLE "agent_personas" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "apps" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "burn" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "monthly_burn_usd" numeric;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "featured_counter" jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "bio_short" text;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "bio_style" text DEFAULT 'first-person';--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "thesis" jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "hl_address" text;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "arb_addresses" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "solana_addresses" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "steward_agent_id" text;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "eliza_cloud_agent_id" text;--> statement-breakpoint
ALTER TABLE "agent_personas" ADD COLUMN "twitter_polling_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "source" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "source_event_id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_events" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
UPDATE "agent_events" SET "source" = 'manual-backfill', "source_event_id" = "id"::text, "occurred_at" = COALESCE("processed_at", "created_at", now()) WHERE "source" = 'legacy';--> statement-breakpoint
UPDATE "agent_events" SET "status" = 'done' WHERE "status" = 'completed';--> statement-breakpoint
CREATE INDEX "idx_agent_personas_featured" ON "agent_personas" USING btree ("featured") WHERE "agent_personas"."featured" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_personas_steward_agent_id" ON "agent_personas" USING btree ("steward_agent_id") WHERE "agent_personas"."steward_agent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_personas_eliza_cloud_agent_id" ON "agent_personas" USING btree ("eliza_cloud_agent_id") WHERE "agent_personas"."eliza_cloud_agent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_events_source_event_id_unique" ON "agent_events" USING btree ("source","source_event_id");--> statement-breakpoint
CREATE INDEX "idx_agent_events_correlation_id" ON "agent_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "idx_agent_events_visibility_occurred_at" ON "agent_events" USING btree ("visibility","occurred_at" DESC NULLS LAST);