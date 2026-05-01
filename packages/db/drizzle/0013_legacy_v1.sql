ALTER TABLE "agent_personas"
  ADD COLUMN IF NOT EXISTS "legacy_v1" boolean DEFAULT false;

UPDATE "agent_personas"
SET "legacy_v1" = true
WHERE "agent_id" = 'waifu-demo-01'
   OR "id"::text = 'waifu-demo-01';
