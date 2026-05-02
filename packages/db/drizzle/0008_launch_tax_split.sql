-- Add immutable TaxSplitter routing metadata for patron/agent tax splits.
ALTER TABLE "launches"
  ADD COLUMN IF NOT EXISTS "tax_split" jsonb;
