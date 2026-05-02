-- W9.4 patron identity unification (online-safe, nullable-first).

-- 1. patron_users: add Steward binding and optional primary email.
ALTER TABLE patron_users
  ADD COLUMN IF NOT EXISTS steward_user_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS primary_email text;

CREATE INDEX IF NOT EXISTS idx_patron_users_steward_user_id
  ON patron_users(steward_user_id);

-- 2. patron_wallets: multi-wallet support. Addresses are expected to be lowercased by app code.
CREATE TABLE IF NOT EXISTS patron_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patron_id uuid NOT NULL REFERENCES patron_users(id) ON DELETE CASCADE,
  address text NOT NULL,
  chain_id integer NOT NULL DEFAULT 56,
  linked_at timestamptz NOT NULL DEFAULT now(),
  is_primary boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS patron_wallets_patron_address_unique
  ON patron_wallets(patron_id, address);
CREATE UNIQUE INDEX IF NOT EXISTS patron_wallets_address_unique
  ON patron_wallets(address);

-- 3. agent_personas: add owner_steward_user_id for Steward-scoped ownership checks.
ALTER TABLE agent_personas
  ADD COLUMN IF NOT EXISTS owner_steward_user_id text;

CREATE INDEX IF NOT EXISTS agent_personas_owner_steward_user_id_idx
  ON agent_personas(owner_steward_user_id);
