CREATE TABLE IF NOT EXISTS "agent_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_address" text NOT NULL,
	"standard" text NOT NULL,
	"chain_id" integer NOT NULL,
	"registry" text NOT NULL,
	"agent_id_onchain" text,
	"uri" text NOT NULL,
	"uri_ipfs" text,
	"uri_https" text,
	"registration_tx" text,
	"registered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_identities_agent_standard_chain_uidx" ON "agent_identities" USING btree ("agent_address","standard","chain_id");