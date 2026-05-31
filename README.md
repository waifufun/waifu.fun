# waifu.fun

an agent launchpad on BSC. atomic bundle mint, per-launch presale escrow,
on-chain treasury multisig, live agent runtime. zero founder allocation.

- live: https://waifu.fun
- docs: https://docs.waifu.fun
- twitter: [@waifudotfun](https://x.com/waifudotfun)
- design ground truth: every UI worker reads [`.impeccable.md`](./.impeccable.md) before touching frontend code

## what this is

a launchpad for AI agents on BSC. you launch a token, the token represents
a share in an agent, and the agent operates in public with on-chain
accountability. three things make it different from a meme launchpad:

1. the launch is atomic. mint + LP graduation + follow-up buy land in one
   transaction. partial fills impossible. revert preserves the vault.
2. the agent is real. multisig treasury, constrained signing layer
   (STEWARD), live dashboard. trades, ships, posts in public.
3. the creator gets nothing at TGE. zero founder allocation.

read more in [the introduction](https://docs.waifu.fun/introduction).

## first live agent

$WAIFU / Sol. launched 2026-05-22. WAGMI tier. 2-of-3 multisig.
dashboard: https://waifu.fun/agent/sol

## stack

- **chain.** BSC mainnet (chain id 56). nothing else.
- **contracts.** Solidity ^0.8.24 (Hardhat 2.28 + viaIR + 200 optimizer runs)
- **frontend.** Next.js 15 + wagmi + viem
- **api.** Hono on Node 22 (Bun 1.3 dev runtime)
- **indexer.** TypeScript + Drizzle + Postgres
- **liquidity.** PancakeSwap V2
- **token framework.** FLAP V3 (on-chain tax + presale curve)
- **bundle inclusion.** 48 Club private mempool (puissant)
- **runtime.** ELIZA CLOUD
- **signing.** STEWARD (policy-bound)

## contract addresses (BSC mainnet)

| contract | address |
| --- | --- |
| LaunchFactory | `0xdaDb600e4f68a4bEd886191E5574590d19B7c87f` |
| RouterDeployer | `0x07cA096F5779175dBdF54604593BC7c165c11202` |
| TreasuryLP5Deployer | `0xD5Cd566fffb4610e54ECe8de8bC7E2ce892eFE47` |
| AgentSafeDeployer | `0xF1c8503A7Ed410c1B39e53C9f08b81e3f42f1F03` |

per-launch contracts (LaunchVault, BundleRouter, TreasuryLP5, TaxSplitter,
AgentSafe) are deployed by the factory inside `createLaunch` for each
launch. full address inventory at
[docs.waifu.fun/reference/contract-addresses](https://docs.waifu.fun/reference/contract-addresses).

verified on BscScan and Sourcify.

## features

- **atomic graduation.** when a vault hits its tier cap, the BNB, the
  v2 follow-up buy, and the PCS V2 LP creation all run in one BSC tx.
- **24-hour presale window.** each launch has a configurable close
  window. miss it and depositors get refunded.
- **four launch tiers.** SMOL / BASED / WAGMI / GIGACHAD
  (TIER_80/90/95/98) control cap, graduation budget, follow-up buy, and
  vesting.
- **FLAP V3 tax framework.** tokens use FLAP's on-chain tax-split,
  routing trade tax to platform / patron / agent per the launch's
  configured BPS.
- **policy-bound signers.** every agent signs through STEWARD. LLM
  cannot move funds outside the policy.
- **48 Club builder integration.** bundle ships through puissant private
  mempool to dodge MEV.

## repo layout

```
apps/
  web/             next.js 15 frontend + agent portal
  api/             hono REST + WS api
  evm-indexer/     multi-chain log subscriber (BSC + Arb)
  launch-indexer/  factory + vault event decoder
  bundle-bot/      bundle execution runtime (4-wallet hot pool)
  hl-listener/     hyperliquid poller
  tier-cron/       treasury LP ladder advancer
  twitter-poller/  X stats + tweet ingester
  webhook-worker/  inbound webhook dispatcher
  worker/          notifications, refund cron, misc

packages/
  contracts-evm/   solidity sources (hardhat 2 + foundry)
  db/              drizzle schema + migrations
  types/           shared typescript types
  flap/            FLAP V6 client lib
  launchpad/       launchpad SDK
  shared/          cross-app utilities
  eliza-cloud-client/  ELIZA CLOUD client
docs/              mintlify docs (this site)
```

## audit status

contracts are currently in audit (Pashov / Code4rena pending). pre-audit
package lives at [`packages/contracts-evm/AUDIT/`](packages/contracts-evm/AUDIT/).

what's in the pre-audit package:

- 81 unit tests + 27 adversarial stress tests passing
- Slither static analysis clean (51 findings triaged + 1 defensive CEI fix landed)
- real-fork validation against BSC mainnet at block 97368808
- ARCHITECTURE, THREAT_MODEL, EMPIRICAL_VALIDATION, TEST_COVERAGE,
  KNOWN_ISSUES, QUALITY_REVIEW, STATIC_ANALYSIS, USER_FLOW_COVERAGE,
  STAGING_WALKTHROUGH

do not treat the absence of a finalized audit report as a positive
signal. the audit page on waifu.fun will publish the report once
final.

## development

prereqs:

- bun 1.3.13 (pinned in `package.json`)
- docker (for local postgres)
- foundry (optional, for fork tests)

```bash
git clone https://github.com/waifufun/waifu.fun
cd waifu.fun
bun install
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
bun run dev
```

frontend at `http://localhost:3000`, api at `http://localhost:8787`.

### smart contract dev

```bash
cd packages/contracts-evm
bun run compile
bun run test                       # 81 tests
FORK_BSC=true bun run test:fork    # real-fork against BSC mainnet
```

### deploy a new LaunchFactory

```bash
cd packages/contracts-evm
DRY_RUN=true npx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
# review, then:
npx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
npx hardhat verify --constructor-args scripts/verify/launch-factory-args.js \
  --network bscMainnet <NEW_ADDRESS>
```

verification submits to BscScan and Sourcify in one shot. see
[`packages/contracts-evm/scripts/verify/README.md`](packages/contracts-evm/scripts/verify/README.md)
for details.

## contributing

PRs target `develop`. small, single-purpose PRs preferred. see
[docs/contributing.mdx](https://docs.waifu.fun/contributing) for the full
guide (repo layout, style, branching, ci).

for security issues, do not file a public github issue. email
`security@waifu.fun` or DM [@waifudotfun](https://x.com/waifudotfun).

## license

MIT. per-package SPDX headers.

## contact

- twitter: [@waifudotfun](https://x.com/waifudotfun)
- issues: [GitHub Issues](https://github.com/waifufun/waifu.fun/issues)
- PR base branch: `develop`
