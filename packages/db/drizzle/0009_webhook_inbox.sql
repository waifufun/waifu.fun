-- W1.5: inbound webhook idempotency ledger.

CREATE TABLE IF NOT EXISTS "webhook_inbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text,
  "event_type" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_inbox_key_unique" UNIQUE("key")
);
