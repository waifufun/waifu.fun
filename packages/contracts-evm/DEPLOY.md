# Deploying Wave H Contracts

Wave H deploys a single `LaunchFactory` per network. Per-launch contracts are created by `LaunchFactory.createLaunch()` at launch time; you do not deploy `LaunchVault`, `BundleRouter`, or `TreasuryLP` manually.

## Prerequisites

1. Deployer EOA private key, with enough BNB to cover the deploy (~0.05 BNB on mainnet).
2. Build + test pass: `bun run --filter @waifufun/contracts-evm compile` and `bun run --filter @waifufun/contracts-evm test`.
3. (Optional) BSCScan API key in `BSCSCAN_API_KEY` for automated verification.

## Environment

```bash
export PRIVATE_KEY=0x...                            # deployer EOA
export PLATFORM_COMMISSION_RECEIVER=0x...           # recorded in deployments/*.json
export BSCSCAN_API_KEY=...                          # optional, for verify
export BSC_RPC=https://bsc-dataseed1.binance.org/   # optional override
```

## Networks

- `bscMainnet` — production. Uses the BSC mainnet address book (WBNB, PCS V2, Flap Portal v5.14.1, TOKEN_TAXED_V3, 48 Club tip receiver) baked into `scripts/deploy/deploy-wave-h.js`.
- `bscTestnet` — sanity-check only. Flap doesn't run on BSC testnet, so the script will refuse to deploy unless you supply `FLAP_PORTAL`, `TOKEN_IMPL_TAXED_V3`, and `TIP_RECEIVER` env vars (typically pointing at deployed mocks). PCS V2 testnet addresses are wired by default.
- `localhost` — use `deploy-wave-h-local.js` instead; see `scripts/deploy/README.md`.

## Step 1: Deploy the factory

```bash
PRIVATE_KEY=0x... \
PLATFORM_COMMISSION_RECEIVER=0x... \
bunx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
```

The script:

1. Reads the BSC mainnet address book (overridable via env vars).
2. Derives the FlapTaxToken EIP-1167 init code hash from `TOKEN_IMPL_TAXED_V3`.
3. Deploys `LaunchFactory` with seven constructor args.
4. Writes `deployments/bsc-mainnet.json` with the deployed address, constructor args, and metadata.
5. Prints the BscScan verify command and next-step checklist.

## Step 2: Verify on BscScan

Copy the printed `bunx hardhat verify` command and run it. It includes all seven constructor args in order.

## Step 3: Wire downstream services

After the factory address is recorded in `deployments/bsc-mainnet.json`:

- Set `LAUNCH_FACTORY_ADDRESS` in `apps/api`, `apps/launch-indexer`, and `apps/bundle-bot` environments.
- Set up the bundle-bot wallet pool per `WAVE_H_OPERATIONAL_PLAN.md` section 1.3.
- Configure the bundle-bot's `BUNDLE_BOT_HOT_KEYS` env var with 4 funded EOAs.
- Run a mainnet smoke launch (tier 80%, smallest config) before opening to users.

## Verification checklist

- [ ] Factory deployed and address recorded in `deployments/bsc-mainnet.json`.
- [ ] Source verified on BscScan.
- [ ] `LAUNCH_FACTORY_ADDRESS` set in API, indexer, bundle-bot.
- [ ] Bundle bot wallet pool funded (~0.5 BNB per wallet for tips + gas).
- [ ] Constructor args sanity-checked: WBNB / PCS factory / PCS router / init code hash / Flap portal / TOKEN_IMPL_TAXED_V3 / tip receiver.
- [ ] `LaunchFactory.tierConfig(TIER_80)` returns `(16, 16, 0, false)` on-chain.
- [ ] A smoke `createLaunch()` succeeds (or reverts with the expected error in phase 1 with `WaveH:phase2`).

## Rollback

The factory has no upgrade path. If something is wrong, deploy a new factory and point services at the new address. The old one becomes orphaned but unaffected; its per-launch vaults remain functional for whatever launches were already in flight.

## Where to read more

- `WAVE_H_FLAP_NATIVE_SPEC.md` — what the contracts do, tier math, bundle flow
- `WAVE_H_OPERATIONAL_PLAN.md` — bundle-bot ops, runbook, alerting
- `scripts/deploy/README.md` — usage details for the deploy scripts
