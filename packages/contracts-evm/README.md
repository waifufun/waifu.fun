# @waifufun/contracts-evm

Hardhat package for waifu.fun's EVM contracts.

## State

Wave H is the active product. The launchpad is Flap-native: Flap mints the token via `Portal.newTokenV6` inside an atomic bundle, and our contracts handle presale escrow + bundle execution + supply distribution around it. Wave H consists of `LaunchFactory`, `LaunchVault`, `BundleRouter`, and `TreasuryLP`, plus shared `flap/` and `uniswap/` interfaces.

Two legacy contracts remain in the tree because they have active downstream consumers:

- `VeWaifuStaking` — staking rewards for WAIFU holders, indexed by `apps/evm-indexer`.
- `TreasuryLP4` — on ice, but still typechecked against by `apps/tier-cron`.

Everything else from previous generations (V1 `WaifuFun*`, V2 `AgentToken*`, splitter/treasury/fee-router stack) was deleted in the Wave H comprehensive cleanup. Git history preserves them.

## Layout

```
contracts/
  BundleRouter.sol        wave H per-launch atomic executor
  LaunchFactory.sol       wave H factory (one per protocol)
  LaunchVault.sol         wave H presale vault (one per launch)
  TreasuryLP.sol          wave H custodial treasury holder
  TreasuryLP4.sol         legacy, on ice
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
