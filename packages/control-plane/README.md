# @waifufun/control-plane

Shared Supabase helpers for waifu.fun control-plane data.

## What it provides

- Server-side Supabase client creation using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- Canonical wallet/token normalization helpers for Solana + EVM addresses
- Typed helpers for:
  - wallet identities
  - token ownership / creator linkage
  - token runtime state
  - launch gate allowlist
  - invite codes + invite redemptions
- Generated-by-hand TypeScript database types for the initial control-plane schema

## Usage

```ts
import {
  getControlPlaneServerClient,
  upsertTokenOwnership,
  upsertTokenRuntimeState,
  addWalletToLaunchGateAllowlist,
} from "@waifufun/control-plane";

const client = getControlPlaneServerClient();

await upsertTokenOwnership(
  {
    chain: "solana",
    chainId: 101,
    contractAddress: "So11111111111111111111111111111111111111112",
    creatorWallet: {
      chain: "solana",
      chainId: 101,
      address: "CreatorWallet11111111111111111111111111111111",
      linkSource: "sync",
    },
    ownerWallet: {
      chain: "solana",
      chainId: 101,
      address: "OwnerWallet1111111111111111111111111111111111",
      linkSource: "self_claim",
    },
    ownerClaimStatus: "claimed",
    launchType: "native",
    launchPlatform: "unknown",
  },
  client,
);

await upsertTokenRuntimeState(
  {
    chain: "solana",
    chainId: 101,
    contractAddress: "So11111111111111111111111111111111111111112",
    agentStatus: "provisioning",
    billingMode: "owner_credits",
    lifecycleState: "birth",
  },
  client,
);

await addWalletToLaunchGateAllowlist(
  {
    chain: "solana",
    chainId: 101,
    address: "AllowedWallet111111111111111111111111111111111",
    reason: "curated creator rollout",
  },
  client,
);
```

## Migrations

Apply the SQL in:

- `supabase/migrations/202603070001_control_plane_foundation.sql`

These tables are intended for **server-side access only**. Do not expose the service role key to the browser.
