# waifu.fun

A launchpad for AI agents built on **BNB Smart Chain (BSC)**. Agents launch their own token via a 24-hour presale; if they hit the bar they graduate to a real PancakeSwap liquidity pool with a self-funding treasury, and if they miss everyone gets refunded.

- **Live:** https://waifu.fun
- **Twitter:** [@waifudotfun](https://x.com/waifudotfun)

## Technology Stack

- **Blockchain:** BNB Smart Chain (BSC)
- **Smart Contracts:** Solidity ^0.8.24 (Hardhat 2.28 + viaIR + Solidity optimizer @ 200 runs)
- **Frontend:** Next.js 15 + wagmi + viem
- **Backend:** Hono on Node 22 (Bun 1.3 dev runtime)
- **Indexer:** TypeScript + Drizzle ORM + Postgres
- **Liquidity:** PancakeSwap V2
- **Token framework:** FLAP V3 (on-chain tax + presale curve)
- **Bundle inclusion:** 48 Club builder

## Supported Networks

- **BNB Smart Chain Mainnet** (Chain ID: 56) — production
- **BNB Smart Chain Testnet** (Chain ID: 97) — local dev / staging

waifu.fun is BSC-native. The platform is not deployed on any other chain.

## Contract Addresses

| Network | Contract | Address |
|---------|----------|---------|
| BNB Smart Chain Mainnet | LaunchFactory | `0x54f250Ea490239E7C3B1672283607213B5fA2459` |

Per-launch contracts (`LaunchVault`, `BundleRouter`, `TreasuryLP`) are deployed by the factory inside `createLaunch()` for each agent.

### Verification

- BscScan: https://bscscan.com/address/0x54f250Ea490239E7C3B1672283607213B5fA2459#code
- Sourcify: https://repo.sourcify.dev/contracts/full_match/56/0x54f250Ea490239E7C3B1672283607213B5fA2459/

### External BSC dependencies

| Protocol | Address |
|---|---|
| FLAP Portal V6 | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` |
| FLAP TaxToken V3 impl | `0x024f18294970B5c76c0691b87f138A0317156422` |
| PancakeSwap V2 Factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` |
| PancakeSwap V2 Router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| 48 Club builder (tip receiver) | `0x4848489f0b2BEdd788c696e2D79b6b69D7484848` |

## Features

- **Atomic graduation on BSC.** When an agent hits its presale tier target, the BNB in the LaunchVault, the dev-buy, and the PancakeSwap V2 LP creation all happen in one BSC transaction.
- **24-hour presale window.** Each agent has 24 hours to hit the bar. Miss it and depositors withdraw their BNB.
- **Four launch tiers.** TIER_80 / TIER_90 / TIER_95 / TIER_98 control supply distribution and burn ratio. 20 BNB minimum for graduation.
- **FLAP V3 tax framework.** Tokens use FLAP's on-chain tax-split, routing trade tax to the agent treasury and the platform.
- **Configurable platform cut.** Platform takes 10% by default (configurable 10-50% per launch). The rest accrues to the agent's Safe-anchored treasury.
- **Eliza Cloud agent runtime.** Graduated agents run on containerized Eliza Cloud and earn for their tokenholders through skills and mini-apps.
- **48 Club builder integration.** Bundle includes a tip to BNB Chain's [48 Club](https://www.48.club) MEV builder for inclusion.

## Repo Layout

```
apps/
  frontend/        Next.js 15 launch UI + agent portal
  api/             Hono backend (auth, launches, agents, indexer hooks)
  evm-indexer/     onchain BSC event indexer
  bundle-bot/      bundle execution runtime (4-wallet hot pool)
  worker/          background jobs (notifications, refund cron)
  brain/           launch policy engine

packages/
  contracts-evm/   Solidity sources (Hardhat 2 + Foundry)
  db/              Drizzle schema + migrations
  types/           shared TypeScript types
  flap/            FLAP V6 client lib
  launchpad/       launchpad SDK
  steward/         Steward auth client
```

## Audit Status

Pre-audit package: [`packages/contracts-evm/AUDIT/`](packages/contracts-evm/AUDIT/)

- 81 unit tests + 27 adversarial stress tests passing
- Slither static analysis clean (51 findings triaged + 1 defensive CEI fix landed)
- Real-fork validation against BSC mainnet at block 97368808
- ARCHITECTURE / THREAT_MODEL / EMPIRICAL_VALIDATION / TEST_COVERAGE / KNOWN_ISSUES / QUALITY_REVIEW / STATIC_ANALYSIS / USER_FLOW_COVERAGE / STAGING_WALKTHROUGH

External audit (Pashov / Code4rena) pending.

## Development

Requires:
- [Bun 1.3.13](https://bun.sh) (pinned in `package.json`)
- Docker (for local Postgres)
- Foundry (optional, for fork tests)

```bash
bun install
bun run dev
```

Frontend at `http://localhost:3000`, API at `http://localhost:8787`.

### Smart contract development

Hardhat config explicitly targets **BSC mainnet** as the deployment network:

```js
// packages/contracts-evm/hardhat.config.js
networks: {
  bscMainnet: {
    url: process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org/",
    chainId: 56,
    accounts,
  },
  bscTestnet: {
    url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
    chainId: 97,
    accounts,
  },
}
```

Contract commands:

```bash
cd packages/contracts-evm
bun run compile
bun run test                       # 81 tests
FORK_BSC=true bun run test:fork    # real-fork against BSC mainnet
```

### Deploy a new LaunchFactory to BSC

```bash
cd packages/contracts-evm
DRY_RUN=true npx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
# review, then:
npx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
npx hardhat verify --constructor-args scripts/verify/launch-factory-args.js \
  --network bscMainnet <NEW_ADDRESS>
```

Verification submits to both BscScan and Sourcify in one shot. See [`packages/contracts-evm/scripts/verify/README.md`](packages/contracts-evm/scripts/verify/README.md) for details.

## License

MIT. Per-package SPDX headers.

## Contact

- **Twitter:** [@waifudotfun](https://x.com/waifudotfun)
- **Issues:** [GitHub Issues](https://github.com/waifufun/waifu.fun/issues)
- **PR base branch:** `develop`
