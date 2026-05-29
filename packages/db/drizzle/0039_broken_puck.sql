CREATE TABLE "treasury_lp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"launch_id" uuid NOT NULL,
	"treasury_lp_address" varchar(42) NOT NULL,
	"event_kind" text NOT NULL,
	"tier_idx" smallint,
	"agent_safe_address" varchar(42),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" varchar(66) DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000' NOT NULL,
	"log_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treasury_lp_events" ADD CONSTRAINT "treasury_lp_events_launch_id_agent_launches_id_fk" FOREIGN KEY ("launch_id") REFERENCES "public"."agent_launches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_treasury_lp_events_launch_kind" ON "treasury_lp_events" USING btree ("launch_id","event_kind");--> statement-breakpoint
CREATE INDEX "idx_treasury_lp_events_treasury_addr" ON "treasury_lp_events" USING btree ("treasury_lp_address");--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_lp_events_tx_log_unique" ON "treasury_lp_events" USING btree ("tx_hash","log_index","block_hash");