ALTER TYPE "public"."flap_event_type" ADD VALUE 'SwapExecuted';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'CurveGraduated';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'LPLocked';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'FeesDistributed';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'Staked';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'Withdrawn';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'RewardClaimed';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'RewardNotified';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'AgentCreated';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'TokenCreate';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'TokenPurchase';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'TokenSale';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'LiquidityAdded';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'TradeStop';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'NftAdded';--> statement-breakpoint
ALTER TYPE "public"."flap_event_type" ADD VALUE 'NftRemoved';--> statement-breakpoint
CREATE TABLE "staking_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" varchar(42) NOT NULL,
	"staked_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"earned_rewards" numeric(78, 0) DEFAULT '0' NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_token" varchar(42) NOT NULL,
	"total_amount" numeric(78, 0) NOT NULL,
	"agent_share" numeric(78, 0) NOT NULL,
	"platform_share" numeric(78, 0) NOT NULL,
	"staker_share" numeric(78, 0) NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_token" varchar(42),
	"wallet_address" varchar(42) NOT NULL,
	"safe_address" varchar(42),
	"steward_tenant_id" varchar(255),
	"steward_agent_id" text,
	"four_meme_request_id" text,
	"launch_tx_hash" varchar(66),
	"internal_agent_id" text,
	"persona" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curve_state" (
	"agent_token" varchar(42) PRIMARY KEY NOT NULL,
	"waifu_bonded" numeric(78, 0) DEFAULT '0' NOT NULL,
	"curve_limit" numeric(78, 0) DEFAULT '0' NOT NULL,
	"raised_token" varchar(42),
	"offers" numeric(78, 0) DEFAULT '0' NOT NULL,
	"funds" numeric(78, 0) DEFAULT '0' NOT NULL,
	"last_price" numeric(78, 0),
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"is_graduated" boolean DEFAULT false NOT NULL,
	"pancakeswap_pair" varchar(42),
	"graduated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "token_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "steward_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "staking_wallet_unique" ON "staking_positions" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_dist_tx_unique" ON "fee_distributions" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallet_token_unique" ON "agent_wallets" USING btree ("agent_token");--> statement-breakpoint
CREATE INDEX "idx_agent_wallet_address" ON "agent_wallets" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "idx_agent_wallet_internal_id" ON "agent_wallets" USING btree ("internal_agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_wallet_steward_id" ON "agent_wallets" USING btree ("steward_agent_id");--> statement-breakpoint
CREATE INDEX "idx_curve_state_status" ON "curve_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creators_steward_user" ON "creators" USING btree ("steward_user_id") WHERE "creators"."steward_user_id" is not null;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "creators" ADD CONSTRAINT "creators_steward_user_id_unique" UNIQUE("steward_user_id");
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;