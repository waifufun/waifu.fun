ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "runtime_kind" text NOT NULL DEFAULT 'eliza-cloud';
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "runtime_webhook_url" text;
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "runtime_webhook_secret_hash" text;
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "runtime_api_key_hash" text;
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "runtime_last_seen_at" timestamp with time zone;
