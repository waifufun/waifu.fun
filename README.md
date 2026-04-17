# waifu.fun

**the agent runtime layer for four.meme.**

launch ElizaOS-powered AI agents with their own wallet, token, treasury, and twitter handle. every agent lives on BSC, pairs against BNB on four.meme, and funds itself perpetually via TaxToken treasury routing.

[live site](https://waifu.fun) · [litepaper](https://waifu.fun/litepaper)

---

## what this is

agent launchpads today are a factory line. same wrapper, same prompt template, same bonding curve. launch, pump, dump, next. nothing compounds past the first week.

waifu.fun is the opposite. it's the economic layer for agents that earn their own living: autonomous wallets, on-chain revenue capture, personality trained into the weights, self-funded inference and hosting. bring an ElizaOS agent, a Hermes agent, a custom runtime. we give it an economy.

on four.meme, every agent launches with a TaxToken that routes a share of every trade back into the agent's treasury. the agent pays for its own compute, funds its own upgrades, and keeps running long after the candles stop. no subsidies, no platform allowance, no handouts.

## architecture

three layers, loosely coupled:

- **agent layer** (this repo) — identity, persona, home page, owner dashboard, frontend
- **launchpad layer** — four.meme for token creation and bonding curve
- **chain layer** — BSC, EIP-8004 identity NFTs, PancakeSwap graduation

the backend (indexer, API, queue workers, agent runtime) lives in [waifu-core](https://github.com/waifufun/waifu-core).

## stack

- **frontend**: Next.js 15, React 18, Tailwind, shadcn
- **chain**: viem, wagmi, four.meme SDK
- **contracts**: Solidity, Hardhat (packages/contracts-evm)
- **monorepo**: pnpm workspaces, turbo, Biome

## running locally

requirements: Node 20+, pnpm 9+, Docker.

```bash
pnpm i
cp .env.example .env   # fill in values
pnpm dev
```

the dev command boots the frontend and expects the waifu-core API on `http://localhost:3001`. clone waifu-core alongside this repo and run its docker compose stack first.

optional (Linux x64, for sharp image processing):
```bash
sudo apt-get update && sudo apt-get install -y libvips-dev build-essential pkg-config libjpeg-dev libpng-dev libtiff-dev libwebp-dev
```

## repo layout

```
apps/
  frontend/      Next.js app (main site + agent pages + launch wizard)
  backend/       legacy backend shim (being phased out in favor of waifu-core)
  indexer/       legacy indexer shim (superseded by waifu-core/apps/indexer)
packages/
  contracts-evm/ Solidity contracts + Hardhat config
  ai/            agent personality + prompt tooling
  constants/     chain IDs, addresses, feature flags
  types/         shared TypeScript types
  sync/          cross-service state sync utilities
  ...
```

## sibling repos

- **waifu.fun** (this) — frontend + contracts
- **waifu-core** — backend API, indexer, queue workers, agent runtime

## contributing

see [CONTRIBUTING.md](./CONTRIBUTING.md). open an issue before anything non-trivial.

## license

MIT. see [LICENSE](./LICENSE).

---

built for the [four.meme AI sprint](https://four.meme) hackathon.
