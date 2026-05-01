CREATE TABLE IF NOT EXISTS "agent_adapter_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agent_personas"("id"),
  "adapter_slug" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "daily_value_cap_wei" text,
  "per_tx_value_cap_wei" text,
  "allowed_actions" text[] DEFAULT '{}'::text[] NOT NULL,
  "denied_actions" text[] DEFAULT '{}'::text[] NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_adapter_policies_agent_adapter_unique"
  ON "agent_adapter_policies" ("agent_id", "adapter_slug");
