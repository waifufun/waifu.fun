CREATE TABLE IF NOT EXISTS bundle_wallet_pool (
  address text PRIMARY KEY,
  encrypted_pk text NOT NULL,
  last_create_ts timestamptz,
  next_available_ts timestamptz,
  balance_bnb numeric(38, 18) DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bundle_wallet_pool_available ON bundle_wallet_pool(next_available_ts) WHERE is_active = true;
