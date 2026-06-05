CREATE TABLE "trade_rationales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"coin" text NOT NULL,
	"side" text,
	"action" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_trade_rationales_agent_coin_created" ON "trade_rationales" USING btree ("agent_id","coin","created_at" DESC NULLS LAST);