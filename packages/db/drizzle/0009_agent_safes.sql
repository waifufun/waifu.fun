CREATE TABLE IF NOT EXISTS "agent_safes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "safe_address" text NOT NULL,
  "roles_modifier_address" text,
  "chain_id" integer NOT NULL,
  "deploy_tx_hash" text,
  "deployed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_safes" ADD CONSTRAINT "agent_safes_agent_id_agent_personas_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agent_personas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_safes_agent_id_unique" ON "agent_safes" USING btree ("agent_id");
