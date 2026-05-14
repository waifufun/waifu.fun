# @waifufun/bundle-bot

The Wave H bundle bot runtime. Standalone long-running process that polls
the `agent_launches` table for ready launches and submits
`BundleRouter.executeBundle()` via Puissant private RPC.

## architecture

```
        agent_launches (postgres)
                │
                ▼ poll every 30s
        ┌───────────────┐
        │  bundle-bot   │  ── selectAvailableWallet (FOR UPDATE SKIP LOCKED)
        └───────────────┘                │
                │                        ▼
                ▼            bundle_wallet_pool (KMS-encrypted keys)
        Puissant private RPC
                │
                ▼
        48 Club builder → BSC mainnet
```

The bot reuses `apps/api/src/services/bundle-submitter.ts`'s
`submitLaunchBundle` function, which already handles:

- wallet pool checkout + release with 90s cooldown per `tx.origin`
- KMS decryption of private keys
- nonce + gas estimation
- 3-step tip escalation (0.03 → 0.05 → 0.08 BNB)
- terminal failure detection after 3 attempts
- DB state transitions: pending → submitted → confirmed / failed_terminal

## running locally

```bash
# Set required env
export DATABASE_URL="postgresql://..."
export ALCHEMY_BSC_URL="https://bnb-mainnet.g.alchemy.com/v2/..."
export BUNDLE_BOT_DRY_RUN=true  # SAFETY: keep this true until ready

# Run once (cron-friendly)
bun run --filter @waifufun/bundle-bot start

# Or run continuously
BUNDLE_BOT_RUN_ONCE= bun run --filter @waifufun/bundle-bot start
```

## env vars

| var | default | description |
|---|---|---|
| `DATABASE_URL` | required | postgres connection string |
| `BSC_CHAIN_ID` | 56 | 56 = mainnet, 97 = testnet |
| `ALCHEMY_BSC_URL` | none | preferred RPC (Alchemy recommended) |
| `BUNDLE_BOT_RPC_URL` | fallback | alternative RPC source |
| `PUISSANT_BSC_URL` | `https://puissant-bsc.48.club` | private mempool endpoint |
| `BUNDLE_BOT_POLL_INTERVAL_MS` | 30000 | sleep between rounds |
| `BUNDLE_BOT_BATCH_SIZE` | 8 | max launches per round |
| `BUNDLE_BOT_MAX_ATTEMPTS` | 3 | terminal after N tries |
| `BUNDLE_BOT_DRY_RUN` | `true` | **SAFETY DEFAULT** — set to `false` to go live |
| `BUNDLE_BOT_RUN_ONCE` | unset | set to `1` to run one round + exit |
| `BUNDLE_WALLET_POOL_REQUIRED` | unset | set to `true` to disable single-wallet fallback |

## safety

**`BUNDLE_BOT_DRY_RUN=true` is the default.** In dry-run mode the bot:

- selects a launch ready for bundle submission
- logs what params it would have sent
- does NOT sign or submit any tx
- does NOT mutate any DB state in the chain-write path

To go live, explicitly set `BUNDLE_BOT_DRY_RUN=false`. This is a kill-switch
that prevents accidental mainnet submission during testing.

## wallet pool ops

The bot pulls from `bundle_wallet_pool` rows via `FOR UPDATE SKIP LOCKED`,
so multiple bot replicas can coexist without double-checkout. Each wallet
gets a 90s cooldown after a successful submission to respect Flap Portal's
`tx.origin` rate limit.

Mandatory minimum pool size for production: 4 wallets. Below that, the
bot may stall when launches arrive faster than the cooldown clears.

To add a wallet to the pool, use the api endpoint (or direct SQL insert
with KMS-encrypted `encrypted_pk`).

## running as a service

Production deploy target is Railway alongside the api + indexer. Use the
following Procfile-style command:

```bash
bun run --filter @waifufun/bundle-bot start
```

The process handles SIGINT + SIGTERM cleanly and drains in-flight rounds
before exiting.

## graduating to live

Recommended runway:

1. testnet deploy contracts → set `BSC_CHAIN_ID=97`
2. fund 1-2 testnet bundle wallets
3. run with `BUNDLE_BOT_DRY_RUN=true` against testnet for a day
4. flip `BUNDLE_BOT_DRY_RUN=false` on testnet, submit one launch
5. inspect tx, wallet rotation, cooldown behavior
6. once stable: bootstrap 4-wallet mainnet pool
7. mainnet `BUNDLE_BOT_DRY_RUN=true` for an hour, observe params
8. flip live, watch the first launch closely

## related

- `apps/api/src/services/bundle-submitter.ts` — submit logic (reused)
- `apps/api/src/services/bundle-wallet-pool.ts` — pool semantics
- `apps/api/src/services/launch-v2/launch-repo.ts` — DB queries
- `~/.moltbot/projects/waifu/specs/WAVE_H_OPERATIONAL_PLAN.md` — full ops plan
