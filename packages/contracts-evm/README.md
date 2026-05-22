# @waifufun/contracts-evm

Hardhat package for waifu.fun's EVM contracts.

## State

Wave H is the active product. The launchpad is Flap-native: Flap mints the token via `Portal.newTokenV6` inside an atomic bundle, and our contracts handle presale escrow + bundle execution + supply distribution around it. Wave H consists of `LaunchFactory`, `LaunchVault`, `BundleRouter`, and `TreasuryLP`, plus shared `flap/` and `uniswap/` interfaces.

### Admin refund: tier-dependent

`LaunchVault` exposes two paths for the factory owner to flip a vault into REFUND state:

- **Real tiers (TIER_80 / TIER_90 / TIER_95 / TIER_98):** `scheduleAdminRefund` + `adminEnableRefund`. A 24h public-notice delay separates the two calls. This ensures the global owner cannot instantly flip live vaults into REFUND without observable on-chain warning, which protects depositors and snipers monitoring for race conditions.
- **TIER_TEST:** `instantAdminRefund` is callable by the factory owner at any time before LAUNCHED, with no delay. TIER_TEST is an explicit smoke-test tier the architect uses to dry-run launches end-to-end; depositors of a TIER_TEST launch are on notice that the launch is recoverable at the architect's discretion.

The `tier` field is set in the `LaunchVault` constructor (passed through from `LaunchFactory.createLaunch`) and is immutable. The gate is enforced on-chain: `instantAdminRefund` reverts `InvalidState` for any non-TEST tier.

Two legacy contracts remain in the tree because they have active downstream consumers:

- `VeWaifuStaking` — staking rewards for WAIFU holders, indexed by `apps/evm-indexer`.
- `TreasuryLP4` — legacy (Wave N1, Chainlink + MC ladder). Preserved for older deployments + still typechecked against by `apps/tier-cron`. Superseded by `TreasuryLP5`.
- `TreasuryLP5` — Wave O.1, V3-tick-gated treasury LP. Active going forward. No Chainlink BNB/USD feed, no market-cap milestones, no epoch advances. setFlapV2Pair is one-shot and mints all 4 single-sided tier positions atomically; tier activation is driven by price-band tick ranges in the V3 pool rather than market-cap targets.

Everything else from previous generations (V1 `WaifuFun*`, V2 `AgentToken*`, splitter/treasury/fee-router stack) was deleted in the Wave H comprehensive cleanup. Git history preserves them.

## Layout

```
contracts/
  BundleRouter.sol        wave H per-launch atomic executor
  LaunchFactory.sol       wave H factory (one per protocol)
  LaunchVault.sol         wave H presale vault (one per launch)
  TreasuryLP.sol          wave H custodial treasury holder (legacy)
  TreasuryLP4.sol         wave N1 legacy (Chainlink + MC ladder)
  TreasuryLP4Deployer.sol legacy helper for TreasuryLP4
  TreasuryLP5.sol         wave O.1 active (V3-tick-gated, single-side at launch)
  TreasuryLP5Deployer.sol active helper for TreasuryLP5 (wired by LaunchFactory)
  VeWaifuStaking.sol      legacy, active indexer consumer
  flap/                   Flap Portal V6 types + interface
  uniswap/                trimmed PancakeSwap V2 surfaces
  interfaces/             IVeWaifuStaking, ITreasuryLPDeps only
  mocks/                  test fixtures (ERC20Mock, MockPancakeSwap, etc.)
scripts/deploy/           wave H deploy scripts (see DEPLOY.md)
test/                     hardhat tests for kept contracts
deployments/              network deployment records
```

## Specs

The Wave H design lives in `~/.moltbot/projects/waifu/specs/`:

- `WAVE_H_FLAP_NATIVE_SPEC.md` — canonical spec, tier math, bundle flow
- `WAVE_H_INTERFACES.md` — Solidity surfaces
- `WAVE_H_OPERATIONAL_PLAN.md` — bundle bot, rate limits, runbook
- `WAVE_H_ROLLBACK_PLAN.md` — initial cleanup decisions

## Commands

```bash
bun run --filter @waifufun/contracts-evm compile
bun run --filter @waifufun/contracts-evm test
bun run --filter @waifufun/contracts-evm lint
```

For deployment, see `DEPLOY.md`.

## Phase status

Phase 1 (scaffolding) is complete. Wave H contracts compile and deploy with `WaveH:phase2` revert stubs. Phase 2 wires real bodies for `LaunchFactory.createLaunch`, `LaunchVault` lifecycle, `BundleRouter.executeBundle`, and `TreasuryLP.recordManagedToken` + `sweep`.
