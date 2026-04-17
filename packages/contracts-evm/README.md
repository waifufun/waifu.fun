# @waifu/contracts-evm

Solidity contracts for waifu.fun on BSC.

## Live

- **`contracts/VeWaifuStaking.sol`** — veWAIFU staking. Users lock WAIFU,
  receive time-weighted voting / revenue share. This is the platform token
  utility contract and remains the only actively maintained source here.
- `contracts/interfaces/IVeWaifuStaking.sol` — public interface used by
  downstream apps.

## Deprecated / archived

See [`contracts/archive/README.md`](./contracts/archive/README.md).

On 2026-04-16 waifu.fun pivoted off its own custom launchpad and moved to
Four.Meme's `TokenManager2` rails on BSC. The V1 `WaifuFun*` curve and the
V2 suite (`WaifuFunV2`, `AgentToken`, `AgentTokenFactoryV2`, `FeeRouter`)
are no longer deployed or imported; their source has been moved into
`contracts/archive/` and is excluded from `hardhat compile`.

For the post-pivot architecture (`TokenManager2` + `AgentIdentifier` +
TaxToken agent treasury) see:

- `/home/shad0w/.moltbot/projects/waifu/STRATEGY.md`
- `/home/shad0w/.moltbot/projects/waifu/PIVOT_PLAN.md`
- `packages/fourmeme` for the runtime client and event indexer

## Usage

```bash
pnpm install
cp .env.example .env
pnpm hardhat compile
```

Only `VeWaifuStaking.sol` (and its OpenZeppelin deps) will compile by default.
Archived sources stay on disk for reference and are re-enabled by deleting the
subtask hook in `hardhat.config.js`.
