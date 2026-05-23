CREATE TABLE "topup_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_token_address" text NOT NULL,
	"patron_address" text,
	"from_chain" integer NOT NULL,
	"from_token" text NOT NULL,
	"from_amount" text NOT NULL,
	"to_chain" integer NOT NULL,
	"to_token" text NOT NULL,
	"to_amount" text,
	"to_address" text NOT NULL,
	"bridge" text,
	"tx_hash" text,
	"status" text DEFAULT 'quoted' NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topup_events_status_check" CHECK ("topup_events"."status" IN ('quoted', 'submitted', 'pending', 'completed', 'partial', 'refunded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "topup_events_by_agent" ON "topup_events" USING btree ("agent_token_address");--> statement-breakpoint
CREATE INDEX "topup_events_by_patron" ON "topup_events" USING btree ("patron_address");--> statement-breakpoint
CREATE INDEX "topup_events_by_tx_hash" ON "topup_events" USING btree ("tx_hash");