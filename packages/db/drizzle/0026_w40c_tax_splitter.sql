-- W40c / V3 audit C-5: per-agent TaxSplitter address.
-- LaunchFactory now deploys a fresh TaxSplitter inside createLaunch() and
-- emits the address on LaunchCreated. The indexer persists it here so the
-- API and UI can surface "release" actions and tax accounting per agent.

ALTER TABLE "agent_launches"
    ADD COLUMN IF NOT EXISTS "tax_splitter_address" varchar(42);
