ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "dormant_at" timestamp with time zone;
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "model_tier" text DEFAULT 'premium';
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "last_words_posted_at" timestamp with time zone;
ALTER TABLE "agent_personas" ADD COLUMN IF NOT EXISTS "credits_top_up_count" integer DEFAULT 0;
