# Archived Contracts (pre-Four.Meme pivot)

This directory preserves the V1/V2 launchpad contracts and supporting code
that were in active development before the April 2026 pivot to Four.Meme.

## Why archived (not deleted)

On 2026-04-16 waifu.fun pivoted away from shipping its own custom bonding
curve. The new architecture sits on top of Four.Meme's launchpad rails
(`TokenManager2` + `AgentIdentifier`) on BSC. See:

- `/home/shad0w/.moltbot/projects/waifu/STRATEGY.md`
- `/home/shad0w/.moltbot/projects/waifu/PIVOT_PLAN.md`

The files are kept on disk (not deleted from git history) so that:

- We can reference the prior design / test coverage if we ever need
  a chain-neutral fallback launchpad.
- Litepaper / docs can link to the historical ABI + constants.
- Nothing silently disappears from the repo.

They are **excluded from `hardhat compile`** via the `paths.sources`
override in `hardhat.config.js`, so they do not participate in the build.

## What lives here

- `WaifuFun.sol`, `WaifuFunToken.sol`, `WaifuFunTokenFactory.sol`
  (V1 bonding curve, carried over from `origin/evm-contracts`)
- `WaifuFunV2.sol`, `AgentToken.sol`, `AgentTokenFactoryV2.sol`, `FeeRouter.sol`
  (V2 launchpad suite; replaced by Four.Meme integration)
- `interfaces/` — all V1/V2 launchpad interfaces
- `mocks/` — test mocks for the V1/V2 flows
- `scripts/` — V1/V2 deploy + params scripts
- `test/` — V1/V2 hardhat test suite (22/22 passing at pivot time)
- `deployments/` — local + BSC testnet deployment manifests at archival

## What remains live (outside this dir)

- `../VeWaifuStaking.sol` — WAIFU token staking utility, still core to the
  platform token economics.
- `../interfaces/IVeWaifuStaking.sol` — interface for the live staking contract.

If you resurrect anything from here, move it back up one level and add it
to `hardhat.config.js paths.sources` (or drop the override entirely).
