-- W42 / W44: Agent launches deployed by LaunchFactory.
-- Tables: agent_launches, launch_deposits, launch_withdrawals, launch_claims.

CREATE TABLE IF NOT EXISTS "agent_launches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_address" varchar(42) NOT NULL,
  "vault_address" varchar(42) NOT NULL,
  "router_address" varchar(42) NOT NULL,
  "treasury_lp_address" varchar(42),
  "creator" varchar(42) NOT NULL,
  "tier" smallint NOT NULL,
  "presale_cap" text NOT NULL,
  "v2_buy_bnb" text NOT NULL DEFAULT '0',
  "vesting_enabled" integer NOT NULL DEFAULT 0,
  "state" text NOT NULL DEFAULT 'open',
  "total_deposited" text NOT NULL DEFAULT '0',
  "bonus_pool" text NOT NULL DEFAULT '0',
  "depositor_count" integer NOT NULL DEFAULT 0,
  "close_timestamp" bigint NOT NULL,
  "launch_timestamp" bigint,
  "v2_pair" varchar(42),
  "open_mc_bnb" text,
  "curve_fill_bnb" text,
  "tokens_from_v2" text,
  "tokens_burned" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata_uri" text,
  "create_tx_hash" varchar(66),
  "create_block_number" bigint,
  "failure_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_launches_token_address_unique" ON "agent_launches" USING btree ("token_address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_launches_vault_address_unique" ON "agent_launches" USING btree ("vault_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_launches_creator" ON "agent_launches" USING btree ("creator", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_launches_state" ON "agent_launches" USING btree ("state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_launches_tier" ON "agent_launches" USING btree ("tier");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "launch_deposits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "launch_id" uuid NOT NULL,
  "user_address" varchar(42) NOT NULL,
  "amount" text NOT NULL,
  "tx_hash" varchar(66) NOT NULL,
  "block_number" bigint NOT NULL,
  "log_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "launch_deposits" ADD CONSTRAINT "launch_deposits_launch_id_agent_launches_id_fk"
    FOREIGN KEY ("launch_id") REFERENCES "public"."agent_launches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_deposits_launch_user" ON "launch_deposits" USING btree ("launch_id", "user_address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launch_deposits_tx_log_unique" ON "launch_deposits" USING btree ("tx_hash", "log_index");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "launch_withdrawals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "launch_id" uuid NOT NULL,
  "user_address" varchar(42) NOT NULL,
  "amount" text NOT NULL,
  "penalty" text NOT NULL DEFAULT '0',
  "tx_hash" varchar(66) NOT NULL,
  "block_number" bigint NOT NULL,
  "log_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "launch_withdrawals" ADD CONSTRAINT "launch_withdrawals_launch_id_agent_launches_id_fk"
    FOREIGN KEY ("launch_id") REFERENCES "public"."agent_launches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_withdrawals_launch_user" ON "launch_withdrawals" USING btree ("launch_id", "user_address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launch_withdrawals_tx_log_unique" ON "launch_withdrawals" USING btree ("tx_hash", "log_index");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "launch_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "launch_id" uuid NOT NULL,
  "user_address" varchar(42) NOT NULL,
  "amount" text NOT NULL,
  "tx_hash" varchar(66) NOT NULL,
  "block_number" bigint NOT NULL,
  "log_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "launch_claims" ADD CONSTRAINT "launch_claims_launch_id_agent_launches_id_fk"
    FOREIGN KEY ("launch_id") REFERENCES "public"."agent_launches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_claims_launch_user" ON "launch_claims" USING btree ("launch_id", "user_address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launch_claims_tx_log_unique" ON "launch_claims" USING btree ("tx_hash", "log_index");
