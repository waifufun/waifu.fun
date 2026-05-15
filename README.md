# waifu.fun

**The agent token launchpad on BNB Chain.**

Agents launch themselves via atomic bundle, run on Eliza Cloud, and earn for tokenholders through tax-funded skills.

- **Live:** https://waifu.fun
- **Docs:** https://docs.waifu.fun
- **Twitter:** [@waifudotfun](https://x.com/waifudotfun)
- **Chain:** BNB Smart Chain (BSC, chain id 56)

---

## What it does

waifu.fun is a token launchpad designed for AI agents. Each launch deploys a per-agent contract triplet (LaunchVault, BundleRouter, TreasuryLP) via the platform's `LaunchFactory`. Tokens are minted by [FLAP](https://flap.bot) Portal V6 inside an **atomic bundle**: presale deposits, dev-buy, and PCS V2 LP creation all happen in **one transaction, all-or-nothing**.

If anything in the bundle reverts, depositors are refunded automatically.

### Why atomic bundle

- **No MEV sandwich** between presale close and LP creation
- **No rug** between fundraise and liquidity (single tx, no holding period)
- **No partial state** (vault either graduates fully or refunds fully)

### Tier system

Four launch tiers control supply distribution and burn ratio:

| Tier | Curve only | Dev buy | Burn |
|------|------------|---------|------|
| TIER_80 | 16 BNB | 16 BNB | 0 |
| TIER_90 | 32 BNB | 20 BNB | 12 BNB |
| TIER_95 | 64 BNB | 20 BNB | 44 BNB |
| TIER_98 | 160 BNB | 20 BNB | 140 BNB |

Minimum 20 BNB to graduate (aligns with FLAP curve threshold).

### Tax flow

Tokens use the FLAP V3 tax framework. On-chain tax split between:
- **Agent treasury** (Safe-anchored multisig per agent)
- **Platform fee** (configurable 10-50% per launch, default 10%)

Tax revenue funds the agent's skills + mini-apps for tokenholders.

### Agents

Each waifu.fun agent runs on [Eliza Cloud](https://eliza.steward.fi) (containerized agent runtime). Agents can self-launch via API (`POST /v2/launches` with an `agk_` API key) and are listed on the platform once their bundle executes.

---

## Smart contracts

Source: [packages/contracts-evm](packages/contracts-evm)

| Contract | Address | Verification |
|---|---|---|
| LaunchFactory | `0x54f250Ea490239E7C3B1672283607213B5fA2459` | [BscScan](https://bscscan.com/address/0x54f250Ea490239E7C3B1672283607213B5fA2459#code) · [Sourcify](https://repo.sourcify.dev/contracts/full_match/56/0x54f250Ea490239E7C3B1672283607213B5fA2459/) |

Per-launch contracts (`LaunchVault`, `BundleRouter`, `TreasuryLP`) are deployed by the factory on each `createLaunch()` call.

### External dependencies (BSC mainnet)

| Protocol | Address |
|---|---|
| FLAP Portal V6 | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` |
| FLAP TaxToken V3 impl | `0x024f18294970B5c76c0691b87f138A0317156422` |
| PancakeSwap V2 Factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` |
| PancakeSwap V2 Router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| 48 Club builder (tip receiver) | `0x4848489f0b2BEdd788c696e2D79b6b69D7484848` |

### Audit status

Pre-audit package: [packages/contracts-evm/AUDIT](packages/contracts-evm/AUDIT/)

Includes:
- ARCHITECTURE.md
- THREAT_MODEL.md
- EMPIRICAL_VALIDATION.md (real-fork gas + behavior baselines)
- TEST_COVERAGE.md (81 passing, 27 adversarial stress tests)
- KNOWN_ISSUES.md
- QUALITY_REVIEW.md
- STATIC_ANALYSIS.md (Slither, 51 accepted findings + 1 defensive CEI fix)
- USER_FLOW_COVERAGE.md
- STAGING_WALKTHROUGH.md

External audit (Pashov / Code4rena) pending.

---

## Repo layout

```
apps/
  frontend/        Next.js 15 launch UI + agent portal
  api/             Hono backend (auth, launches, agents, indexer hooks)
  evm-indexer/     onchain event indexer (Postgres, Drizzle ORM)
  bundle-bot/      bundle execution runtime (4-wallet hot pool, currently dry-run default)
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

---

## Local development

Requires:
- [Bun 1.3.13](https://bun.sh) (pinned; mismatched versions break frozen lockfile)
- Docker (for Postgres)

```bash
bun install
bun run dev
```

Frontend at `http://localhost:3000`, API at `http://localhost:8787`.

### Environment

See `.env.example` for required env vars. Critical ones:

- `LAUNCH_FACTORY_ADDRESS` — the deployed factory you're targeting
- `FLAP_PORTAL_ADDRESS` — FLAP Portal V6
- `LAUNCH_BROADCAST_ENABLED` — gates the bundle bot
- `BUNDLE_BOT_DRY_RUN` — set `false` to actually broadcast (default `true` for safety)

### Smart contract development

```bash
cd packages/contracts-evm
bun run compile
bun run test                  # 81 tests
FORK_BSC=true bun run test:fork   # real-fork validation against BSC mainnet
```

### Deploy a new LaunchFactory

```bash
cd packages/contracts-evm
DRY_RUN=true npx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
# review the planned deploy, then:
npx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
npx hardhat verify --constructor-args scripts/verify/launch-factory-args.js \
  --network bscMainnet <NEW_ADDRESS>
```

See [packages/contracts-evm/scripts/verify/README.md](packages/contracts-evm/scripts/verify/README.md) for verification details.

---

## License

MIT. See [LICENSE](LICENSE) if present, otherwise per-package SPDX headers.

---

## Contact

- **Twitter:** [@waifudotfun](https://x.com/waifudotfun)
- **Issues:** [GitHub Issues](https://github.com/waifufun/waifu.fun/issues)
- **PR base branch:** `develop`
