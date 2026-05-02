CREATE TYPE "public"."creator_admin_role" AS ENUM('super_admin', 'admin', 'moderator');--> statement-breakpoint
CREATE TYPE "public"."migration_status" AS ENUM('pending', 'migrating', 'migrated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."flap_event_type" AS ENUM('TokenCreated', 'TokenBought', 'TokenSold', 'FlapTokenProgressChanged', 'LaunchedToDEX');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'retrying', 'dead');--> statement-breakpoint
CREATE TYPE "public"."launch_status" AS ENUM('draft', 'pending_review', 'approved', 'preparing', 'ready', 'submitted', 'confirmed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."token_status" AS ENUM('active', 'migrating', 'migrated', 'hidden', 'delisted');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"avatar_url" text,
	"cloud_agent_id" text,
	"runtime_provider" text,
	"agent_status" text DEFAULT 'none' NOT NULL,
	"lifecycle_state" text,
	"web_ui_url" text,
	"bridge_url" text,
	"billing_mode" text,
	"infra_reserve_usd" numeric,
	"suspended_reason" text,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evm_address" text,
	"solana_address" text,
	"display_name" text,
	"avatar_url" text,
	"twitter_handle" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"admin_role" "creator_admin_role",
	"admin_perms" text[],
	"points" bigint DEFAULT 0 NOT NULL,
	"weekly_points" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_evm_address_unique" UNIQUE("evm_address"),
	CONSTRAINT "creators_solana_address_unique" UNIQUE("solana_address")
);
--> statement-breakpoint
CREATE TABLE "dex_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"dex_name" text,
	"pool_address" text,
	"lp_token_address" text,
	"migration_tx_hash" text,
	"migration_block" bigint,
	"base_amount" numeric,
	"quote_amount" numeric,
	"status" "migration_status" DEFAULT 'pending' NOT NULL,
	"event_id" bigint,
	"migrated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"event_type" "flap_event_type" NOT NULL,
	"portal_address" text NOT NULL,
	"token_address" text NOT NULL,
	"actor_address" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_topics" text[],
	"raw_data" "bytea",
	"block_timestamp" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"process_error" text
);
--> statement-breakpoint
CREATE TABLE "indexer_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"last_block" bigint DEFAULT 0 NOT NULL,
	"last_block_time" timestamp with time zone,
	"backfill_from" bigint,
	"backfill_to" bigint,
	"backfill_current" bigint,
	"backfill_done" boolean DEFAULT false NOT NULL,
	"last_poll_at" timestamp with time zone,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"max_uses" integer NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "invite_codes_max_uses_check" CHECK ("invite_codes"."max_uses" >= 1),
	CONSTRAINT "invite_codes_used_count_check" CHECK ("invite_codes"."used_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"invite_code_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_redemptions_invite_code_id_creator_id_pk" PRIMARY KEY("invite_code_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" text NOT NULL,
	"job_type" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"invite_code_id" uuid,
	"token_name" text NOT NULL,
	"token_ticker" text NOT NULL,
	"token_image_url" text,
	"token_description" text,
	"metadata_uri" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chain_id" integer NOT NULL,
	"portal_address" text NOT NULL,
	"quote_token" text,
	"tax_rate" integer DEFAULT 0 NOT NULL,
	"salt" "bytea",
	"token_type" text DEFAULT 'standard' NOT NULL,
	"status" "launch_status" DEFAULT 'draft' NOT NULL,
	"tx_hash" text,
	"token_address" text,
	"failure_reason" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"price" numeric,
	"market_cap_usd" numeric,
	"volume_period" numeric,
	"holder_count" integer,
	"curve_progress" numeric,
	"reserve_amount" numeric,
	"snapshot_at" timestamp with time zone NOT NULL,
	"period_seconds" integer DEFAULT 300 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"image_url" text,
	"description" text,
	"metadata_uri" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creator_address" text NOT NULL,
	"creator_id" uuid,
	"launch_id" uuid,
	"launch_platform" text DEFAULT 'flap' NOT NULL,
	"portal_address" text,
	"decimals" integer DEFAULT 18 NOT NULL,
	"total_supply" numeric NOT NULL,
	"tax_rate" integer DEFAULT 0 NOT NULL,
	"is_tax_token" boolean DEFAULT false NOT NULL,
	"bonding_curve_addr" text,
	"curve_progress" numeric,
	"curve_limit" numeric,
	"reserve_amount" numeric,
	"virtual_reserves" numeric,
	"current_price" numeric,
	"market_cap_usd" numeric,
	"token_price_usd" numeric,
	"volume_24h" numeric DEFAULT '0' NOT NULL,
	"price_change_24h" numeric,
	"holder_count" integer DEFAULT 0 NOT NULL,
	"dex_pool_address" text,
	"migrated_at" timestamp with time zone,
	"status" "token_status" DEFAULT 'active' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_imported" boolean DEFAULT false NOT NULL,
	"agent_id" uuid,
	"agent_status" text DEFAULT 'none' NOT NULL,
	"owner_claim_status" text DEFAULT 'unclaimed' NOT NULL,
	"last_trade_at" timestamp with time zone,
	"last_price_update" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"trader_address" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"amount_in" numeric NOT NULL,
	"amount_out" numeric NOT NULL,
	"price" numeric,
	"usd_value" numeric,
	"tx_hash" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_creators_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dex_migrations" ADD CONSTRAINT "dex_migrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_creators_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launches" ADD CONSTRAINT "launches_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launches" ADD CONSTRAINT "launches_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_launch_id_launches_id_fk" FOREIGN KEY ("launch_id") REFERENCES "public"."launches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_admin" ON "admin_audit_log" USING btree ("admin_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_audit_target" ON "admin_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_time" ON "admin_audit_log" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_agents_token" ON "agents" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "idx_agents_status" ON "agents" USING btree ("agent_status");--> statement-breakpoint
CREATE INDEX "idx_creators_evm" ON "creators" USING btree ("evm_address") WHERE "creators"."evm_address" is not null;--> statement-breakpoint
CREATE INDEX "idx_creators_solana" ON "creators" USING btree ("solana_address") WHERE "creators"."solana_address" is not null;--> statement-breakpoint
CREATE INDEX "idx_creators_admin" ON "creators" USING btree ("admin_role") WHERE "creators"."admin_role" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dex_migrations_chain_token_uq" ON "dex_migrations" USING btree ("chain_id","token_address");--> statement-breakpoint
CREATE UNIQUE INDEX "events_chain_tx_log_uq" ON "events" USING btree ("chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "idx_events_token" ON "events" USING btree ("token_address","block_number");--> statement-breakpoint
CREATE INDEX "idx_events_type" ON "events" USING btree ("event_type","block_number");--> statement-breakpoint
CREATE INDEX "idx_events_actor" ON "events" USING btree ("actor_address","block_number" desc) WHERE "events"."actor_address" is not null;--> statement-breakpoint
CREATE INDEX "idx_events_block" ON "events" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "idx_events_unprocessed" ON "events" USING btree ("processed","id") WHERE "events"."processed" = false;--> statement-breakpoint
CREATE INDEX "idx_events_timestamp" ON "events" USING btree ("block_timestamp" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cursors_chain_contract" ON "indexer_cursors" USING btree ("chain_id","contract_address");--> statement-breakpoint
CREATE INDEX "idx_invite_active" ON "invite_codes" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_queue_status" ON "jobs" USING btree ("queue_name","status","run_after");--> statement-breakpoint
CREATE INDEX "idx_jobs_reference" ON "jobs" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_idempotency" ON "jobs" USING btree ("idempotency_key") WHERE "jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_launches_creator" ON "launches" USING btree ("creator_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_launches_status" ON "launches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_launches_token" ON "launches" USING btree ("token_address") WHERE "launches"."token_address" is not null;--> statement-breakpoint
CREATE INDEX "idx_snapshots_token_time" ON "token_snapshots" USING btree ("token_address","snapshot_at" desc);--> statement-breakpoint
CREATE INDEX "idx_snapshots_time" ON "token_snapshots" USING btree ("snapshot_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_chain_contract_uq" ON "tokens" USING btree ("chain_id","contract_address");--> statement-breakpoint
CREATE INDEX "idx_tokens_status_market" ON "tokens" USING btree ("status","market_cap_usd" desc nulls last);--> statement-breakpoint
CREATE INDEX "idx_tokens_status_volume" ON "tokens" USING btree ("status","volume_24h" desc);--> statement-breakpoint
CREATE INDEX "idx_tokens_status_created" ON "tokens" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_tokens_creator_addr" ON "tokens" USING btree ("creator_address");--> statement-breakpoint
CREATE INDEX "idx_tokens_creator_id" ON "tokens" USING btree ("creator_id") WHERE "tokens"."creator_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_tokens_featured" ON "tokens" USING btree ("is_featured","created_at" desc) WHERE "tokens"."is_featured" = true;--> statement-breakpoint
CREATE INDEX "idx_tokens_search" ON "tokens" USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("ticker", '') || ' ' || coalesce("contract_address", '')));--> statement-breakpoint
CREATE INDEX "idx_tokens_last_trade" ON "tokens" USING btree ("last_trade_at" desc nulls last);--> statement-breakpoint
CREATE INDEX "idx_tokens_agent" ON "tokens" USING btree ("agent_id") WHERE "tokens"."agent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "trades_chain_tx_event_uq" ON "trades" USING btree ("chain_id","tx_hash","event_id");--> statement-breakpoint
CREATE INDEX "idx_trades_token_time" ON "trades" USING btree ("token_address","block_timestamp" desc);--> statement-breakpoint
CREATE INDEX "idx_trades_trader" ON "trades" USING btree ("trader_address","block_timestamp" desc);--> statement-breakpoint
CREATE INDEX "idx_trades_token_side" ON "trades" USING btree ("token_address","side","block_timestamp" desc);