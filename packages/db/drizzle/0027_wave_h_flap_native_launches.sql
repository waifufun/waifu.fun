-- Wave H Flap-native launch lifecycle fields. Additive only, do not apply to prod until Wave H contracts land.
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "predicted_token_address" varchar(42);
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "vanity_salt" varchar(66);
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "flap_meta_cid" text;
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "flap_token_address" varchar(42);
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "bundle_tx_hash" varchar(66);
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "bundle_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "bundle_attempt" integer NOT NULL DEFAULT 0;
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "bundle_tip_bnb" text NOT NULL DEFAULT '0.03';
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "bundle_failure_reason" text;

CREATE INDEX IF NOT EXISTS "idx_agent_launches_predicted_token" ON "agent_launches" ("predicted_token_address");
CREATE INDEX IF NOT EXISTS "idx_agent_launches_flap_token" ON "agent_launches" ("flap_token_address");
CREATE INDEX IF NOT EXISTS "idx_agent_launches_bundle_status" ON "agent_launches" ("bundle_status");
