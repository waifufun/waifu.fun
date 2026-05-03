ALTER TABLE "patron_wallets" ADD COLUMN IF NOT EXISTS "chain_namespace" text NOT NULL DEFAULT 'evm';
CREATE INDEX IF NOT EXISTS "patron_wallets_patron_chain_idx" ON "patron_wallets" USING btree ("patron_id", "chain_namespace");
