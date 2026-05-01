CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(128),
	"token_address" varchar(66),
	"type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_agent_events_status_created_at" ON "agent_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_events_token_created_at" ON "agent_events" USING btree ("token_address","created_at");
