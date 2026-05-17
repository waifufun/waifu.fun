-- Persist per-launch buy/sell tax settings used by BundleRouter.executeBundle.
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "buy_tax_bps" integer NOT NULL DEFAULT 300;
ALTER TABLE "agent_launches" ADD COLUMN IF NOT EXISTS "sell_tax_bps" integer NOT NULL DEFAULT 300;
