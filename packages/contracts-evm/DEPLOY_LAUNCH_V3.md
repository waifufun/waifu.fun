# Deploying LaunchFactory v3 (burn edition)

## Prerequisites

1. **Funded deployer wallet** with the network's native token (BNB on BSC).
2. **`DEPLOYER` env var** set to the deployer private key (with `0x` prefix is fine; check `hardhat.config.js` `accounts: [process.env.DEPLOYER]`).
3. **`PLATFORM_WALLET` env var** set to the platform fee recipient. The factory passes this to every per-agent TaxSplitter so 10% of every taxed transfer ends up here. The other 90% routes to the agent's `creator` address.
4. **`BSCSCAN_API_KEY`** if you plan to verify (testnet works with the same key as mainnet).

## What changed in W40c

Pre-W40c, LaunchFactory took a single `TAX_SPLITTER` constructor address that every agent shared. That meant every agent split tax identically and the 90/10 spec could not be honored per-agent.

W40c flips this: the factory takes a `_platformWallet` instead, and **deploys a fresh TaxSplitter inside `createLaunch()` for each agent**, parameterized with `[creator, platformWallet]` recipients and `[9000, 1000]` bps. No need to deploy a TaxSplitter ahead of time.

The new splitter address is exposed via:
- the `LaunchCreated` event (`taxSplitter` field)
- `LaunchAddresses.taxSplitter` (returned by `createLaunch`, also queryable via `factory.launches(token)`)

## Step 1: Deploy LaunchFactory

### BSC testnet

```bash
cd packages/contracts-evm
PLATFORM_WALLET=0x... \
DEPLOYER=0x... \
DEPLOY_TARGET=launch-v3 \
  bunx hardhat run scripts/deploy/run.js --network bscTestnet
```

Expected output:

```
Deploying LaunchFactory v3 on bscTestnet

  WBNB:            0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
  PCS_FACTORY:     0x6725F303b657a9451d8BA641348b6761A6CC7a17
  PCS_ROUTER:      0xD99D1c33F9fC3444f8101754aBC46c52416550D1
  INIT_CODE_HASH:  0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5
  PLATFORM_WALLET: 0x...
  FLAP_PORTAL:     0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9

LaunchFactory deployed on bscTestnet: 0x...

Set this in your API .env:
  LAUNCH_FACTORY_ADDRESS=0x...

Verify on BSCScan:
  bunx hardhat verify --network bscTestnet 0x... \
    0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd \
    0x6725F303b657a9451d8BA641348b6761A6CC7a17 \
    0xD99D1c33F9fC3444f8101754aBC46c52416550D1 \
    0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5 \
    0x... \
    0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9
```

### BSC mainnet

```bash
PLATFORM_WALLET=0x... \
DEPLOYER=0x... \
DEPLOY_TARGET=launch-v3 \
BSC_RPC=https://bsc-dataseed1.binance.org/ \
  bunx hardhat run scripts/deploy/run.js --network bscMainnet
```

## Step 2: Verify on BSCScan

Run the verify command printed by the deploy script. It includes constructor args.

## Step 3: Update Railway env vars

```bash
TOKEN=$(cat ~/.moltbot/secrets/railway-waifu-token)
curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation VariableUpsert($input:VariableUpsertInput!){variableUpsert(input:$input)}","variables":{"input":{"projectId":"b79efc5a-37a6-45e7-8241-f34e537a5ba5","environmentId":"399b58c4-b4c2-4662-987f-947e45397dbe","serviceId":"bc9295a0-abea-493c-8fa3-1e6066a391fd","name":"LAUNCH_FACTORY_ADDRESS","value":"0x..."}}}'
```

## Step 4: First test launch

```bash
# Create a tier-80 launch
curl -X POST https://api.waifu.fun/v2/launches \
  -H "Authorization: Bearer ${SOL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sol Test",
    "symbol": "SOLT",
    "tier": 80,
    "creator": "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
    "imageUrl": "https://...",
    "closeTimestamp": 1715200000
  }'
```

The factory `createLaunch` should be called by the API's signing wallet. Verify on BSCScan that:

1. `AgentTokenV3` was deployed with 1B supply
2. `LaunchVault` was deployed and holds 200M tokens
3. `BundleRouter` was deployed
4. `TaxSplitter` was deployed for this agent with `[creator, platformWallet]` / `[9000, 1000]`
5. The `LaunchCreated` event includes the splitter address

## Step 5: Releasing collected tax

The 3% transfer tax accrues as ERC20 balance on the per-agent `TaxSplitter`. Anyone can call `splitter.release(tokenAddress)` to push 90% to the creator and 10% to the platform wallet. The UI / indexer should surface a "release" action on each agent page.

## Notes

- The factory exempts the per-agent splitter, the factory itself, the router, the vault, and DEAD from the 3% tax (set in `AgentTokenV3` constructor + factory bootstrap)
- After bootstrap is finalized, no further tax-exempt addresses can be added for that agent
- TreasuryLP4 wiring into LaunchFactory is a follow-up wave (W40b). Currently the factory holds 100M as a reserve for it
