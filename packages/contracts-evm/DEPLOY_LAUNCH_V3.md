# Deploying LaunchFactory v3 (burn edition)

## Prerequisites

1. **Funded deployer wallet** with the network's native token (BNB on BSC).
2. **`DEPLOYER` env var** set to the deployer private key (hex, no `0x` prefix? no, with `0x` prefix is fine; check `hardhat.config.js` `accounts: [process.env.DEPLOYER]`).
3. **`TAX_SPLITTER` env var** set to a deployed TaxSplitter address. The factory passes this to every deployed `AgentTokenV3` so the 3% transfer tax has a destination.
4. **`BSCSCAN_API_KEY`** if you plan to verify (testnet works with the same key as mainnet).

## Step 1: Deploy TaxSplitter (if not already deployed)

The TaxSplitter is the destination for the 3% transfer tax on every `AgentTokenV3`. It splits 90% to the agent and 10% to the platform fee wallet.

If you don't have one yet, deploy a fresh one. (TODO: add `tax-splitter` deploy target.)

For a quick mock on testnet, you can deploy any contract that can `release(token)` to receive tax.

## Step 2: Deploy LaunchFactory

### BSC testnet

```bash
cd packages/contracts-evm
TAX_SPLITTER=0x... \
DEPLOYER=0x... \
DEPLOY_TARGET=launch-v3 \
  bunx hardhat run scripts/deploy/run.js --network bscTestnet
```

Expected output:

```
Deploying LaunchFactory v3 on bscTestnet

  WBNB:           0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
  PCS_FACTORY:    0x6725F303b657a9451d8BA641348b6761A6CC7a17
  PCS_ROUTER:     0xD99D1c33F9fC3444f8101754aBC46c52416550D1
  INIT_CODE_HASH: 0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5
  TAX_SPLITTER:   0x...

LaunchFactory deployed on bscTestnet: 0x...

Set this in your API .env:
  LAUNCH_FACTORY_ADDRESS=0x...

Verify on BSCScan:
  bunx hardhat verify --network bscTestnet 0x... \
    0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd \
    0x6725F303b657a9451d8BA641348b6761A6CC7a17 \
    0xD99D1c33F9fC3444f8101754aBC46c52416550D1 \
    0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5 \
    0x...
```

### BSC mainnet

```bash
TAX_SPLITTER=0x... \
DEPLOYER=0x... \
DEPLOY_TARGET=launch-v3 \
BSC_RPC=https://bsc-dataseed1.binance.org/ \
  bunx hardhat run scripts/deploy/run.js --network bscMainnet
```

## Step 3: Verify on BSCScan

Run the verify command printed by the deploy script. It includes constructor args.

## Step 4: Update Railway env vars

```bash
TOKEN=$(cat ~/.moltbot/secrets/railway-waifu-token)
curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation VariableUpsert($input:VariableUpsertInput!){variableUpsert(input:$input)}","variables":{"input":{"projectId":"b79efc5a-37a6-45e7-8241-f34e537a5ba5","environmentId":"399b58c4-b4c2-4662-987f-947e45397dbe","serviceId":"bc9295a0-abea-493c-8fa3-1e6066a391fd","name":"LAUNCH_FACTORY_ADDRESS","value":"0x..."}}}'
```

## Step 5: First test launch

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
4. `TreasuryLP4` was deployed (or 100M reserved for it)

## Notes

- The factory sets the bootstrap tax-exempt list automatically (router, vault, factory itself, dead, treasury LP)
- After the first launch, the bootstrap is locked via `finalizeBootstrap()` and no further tax-exempt addresses can be added
- TreasuryLP4 wiring into LaunchFactory is a follow-up wave (W40b). Currently the factory holds 100M as a reserve for it
