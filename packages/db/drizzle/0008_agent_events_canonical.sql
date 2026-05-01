-- W1.7: canonical agent_events activity stream columns.
-- Additive only: preserve the existing brain-worker queue columns.

ALTER TABLE "agent_events"
  ADD COLUMN IF NOT EXISTS "event_type" text,
  ADD COLUMN IF NOT EXISTS "data" jsonb,
  ADD COLUMN IF NOT EXISTS "tx_hash" text,
  ADD COLUMN IF NOT EXISTS "block_number" text,
  ADD COLUMN IF NOT EXISTS "chain_id" text;
--> statement-breakpoint

UPDATE "agent_events"
SET
  "event_type" = COALESCE(
    "event_type",
    CASE "type"
      WHEN 'agent.created' THEN 'token.created'
      WHEN 'agent.trade.buy' THEN 'token.purchased'
      WHEN 'agent.trade.sell' THEN 'token.sold'
      ELSE "type"
    END
  ),
  "data" = COALESCE("data", "payload", '{}'::jsonb),
  "tx_hash" = COALESCE("tx_hash", "payload"->>'txHash'),
  "block_number" = COALESCE("block_number", "payload"->>'blockNumber'),
  "chain_id" = COALESCE("chain_id", "payload"->>'chainId')
WHERE "event_type" IS NULL
   OR "data" IS NULL
   OR "tx_hash" IS NULL
   OR "block_number" IS NULL
   OR "chain_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "agent_events"
  ALTER COLUMN "event_type" SET NOT NULL,
  ALTER COLUMN "data" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "data" SET NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "agent_events_canonical_defaults"()
RETURNS trigger AS $$
BEGIN
  IF NEW."event_type" IS NULL THEN
    NEW."event_type" := CASE NEW."type"
      WHEN 'agent.created' THEN 'token.created'
      WHEN 'agent.trade.buy' THEN 'token.purchased'
      WHEN 'agent.trade.sell' THEN 'token.sold'
      ELSE NEW."type"
    END;
  END IF;

  IF NEW."data" IS NULL THEN
    NEW."data" := COALESCE(NEW."payload", '{}'::jsonb);
  END IF;

  IF NEW."type" IS NULL THEN
    NEW."type" := NEW."event_type";
  END IF;

  IF NEW."payload" IS NULL THEN
    NEW."payload" := COALESCE(NEW."data", '{}'::jsonb);
  END IF;

  IF NEW."tx_hash" IS NULL THEN
    NEW."tx_hash" := NEW."data"->>'txHash';
  END IF;

  IF NEW."block_number" IS NULL THEN
    NEW."block_number" := NEW."data"->>'blockNumber';
  END IF;

  IF NEW."chain_id" IS NULL THEN
    NEW."chain_id" := NEW."data"->>'chainId';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "trg_agent_events_canonical_defaults" ON "agent_events";
--> statement-breakpoint
CREATE TRIGGER "trg_agent_events_canonical_defaults"
BEFORE INSERT OR UPDATE ON "agent_events"
FOR EACH ROW EXECUTE FUNCTION "agent_events_canonical_defaults"();
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_agent_events_agent_id" ON "agent_events" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_events_type" ON "agent_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_events_created_at" ON "agent_events" USING btree ("created_at" DESC);
