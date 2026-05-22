-- Phase 1 wallet registry: many wallet roles per launched agent token.
-- Existing agent_wallets is a legacy launch/orchestrator binding table, so the
-- dashboard registry gets a dedicated physical table to avoid breaking launch flows.

CREATE TABLE IF NOT EXISTS "agent_wallet_registry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_token_address" text NOT NULL,
  "address" text NOT NULL,
  "chain" text NOT NULL,
  "role" text NOT NULL,
  "venue" text,
  "label" text NOT NULL,
  "owner_type" text DEFAULT 'agent' NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  "added_by" text,
  CONSTRAINT "agent_wallet_registry_chain_check"
    CHECK ("chain" IN ('bsc', 'eth', 'arb', 'base', 'op', 'polygon', 'solana')),
  CONSTRAINT "agent_wallet_registry_role_check"
    CHECK ("role" IN ('agent-safe', 'agent-hot', 'patron', 'venue-bridge')),
  CONSTRAINT "agent_wallet_registry_owner_type_check"
    CHECK ("owner_type" IN ('agent', 'patron', 'platform'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_wallet_registry_uniq_agent_addr_chain"
  ON "agent_wallet_registry" ("agent_token_address", "address", "chain");

CREATE INDEX IF NOT EXISTS "agent_wallet_registry_by_agent"
  ON "agent_wallet_registry" ("agent_token_address");
