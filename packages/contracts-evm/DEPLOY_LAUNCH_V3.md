# Deploying LaunchFactory v3 (burn edition)

## Prerequisites

1. **Funded deployer wallet** with the network native token (BNB on BSC).
2. **`DEPLOYER` env var** set to the deployer private key. The Hardhat config reads this value into `accounts`.
3. **`PLATFORM_WALLET` env var** set to the platform fee recipient. The factory deploys one TaxSplitter per agent launch, with 90% routed to the launch creator and 10% routed to this wallet.
4. **`BSCSCAN_API_KEY` env var** if you plan to verify the factory on BSCScan.
5. **RPC env vars** for the target network:
   - `BSC_RPC` for Hardhat deploys on BSC mainnet. Defaults to public BSC RPC if omitted.
   - `FORK_BSC`, `FORK_BSC_URL`, and `FORK_BSC_BLOCK` for fork verification tests, not for deploy.

## Runtime env vars after deploy

Set these in the API or indexer environment after the factory is deployed:

| Env var | Used by | Purpose |
| --- | --- | --- |
| `LAUNCH_FACTORY_ADDRESS` | API, launch indexer | Address printed by the deploy script. Required before `POST /v2/launches` can create on-chain launches. |
| `LAUNCH_FACTORY_SIGNER_PK` | API | Private key for the server-side signer that calls `LaunchFactory.createLaunch`. Keep funded with BNB and protected by SIWE route auth. |
| `BSC_RPC_URL` or `RPC_URL` | API, indexers, cron | Public client and transaction polling RPC. Prefer a paid RPC for launch day. |
| `FLAP_PORTAL_ADDRESS` | API compat layer, EVM indexer, flap package | Flap portal address. Mainnet defaults to `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`; testnet should be set explicitly if different. |
| `TREASURY_RESERVE_AGENT_SAFE` | ops convention | Agent Safe intended to own or receive control of each launch treasury reserve when the creator is not the final treasury controller. The current factory takes `creator` in `LaunchConfig`, so this is supplied through the launch request rather than the deploy script. |

## Current factory shape

The v3 factory constructor is:

```solidity
constructor(
    address _wbnb,
    address _pcsFactory,
    address _pcsRouter,
    bytes32 _initCodeHash,
    address _platformWallet,
    address _flapPortal
)
```

`createLaunch()` deploys the full per-agent stack:

- `AgentTokenV3` with 1B supply.
- `TaxSplitter` per agent, recipients `[creator, platformWallet]`, bps `[9000, 1000]`.
- `BundleRouter` with the Flap portal address, then ownership is transferred to the vault.
- `LaunchVault` with presale cap, V2 buy BNB, close timestamp, vesting flag, and refund support.
- `TreasuryReserve` owned by the launch creator for the 10% treasury allocation.

The token allocation is 50% burn, 20% presale, 20% launch/V2 LP inventory in the vault, and 10% treasury reserve.

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

```text
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
```

### BSC mainnet

```bash
cd packages/contracts-evm
PLATFORM_WALLET=0x... \
DEPLOYER=0x... \
DEPLOY_TARGET=launch-v3 \
BSC_RPC=https://bsc-dataseed1.binance.org/ \
  bunx hardhat run scripts/deploy/run.js --network bscMainnet
```

## Step 2: Verify on BSCScan

Run the verify command printed by the deploy script. It includes constructor args:

```bash
bunx hardhat verify --network bscTestnet 0xFACTORY \
  0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd \
  0x6725F303b657a9451d8BA641348b6761A6CC7a17 \
  0xD99D1c33F9fC3444f8101754aBC46c52416550D1 \
  0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5 \
  0xPLATFORM_WALLET \
  0xFLAP_PORTAL
```

## Step 3: Update service env vars

At minimum, the API needs:

```bash
LAUNCH_FACTORY_ADDRESS=0x...
LAUNCH_FACTORY_SIGNER_PK=0x...
BSC_RPC_URL=https://...
FLAP_PORTAL_ADDRESS=0x...
```

The launch indexer needs:

```bash
LAUNCH_FACTORY_ADDRESS=0x...
BSC_RPC_URL=https://...
```

Use the existing Railway GraphQL variable upsert flow for production env changes.

## Step 4: First test launch

```bash
curl -X POST https://api.waifu.fun/v2/launches \
  -H "Authorization: Bearer ${SOL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sol test",
    "symbol": "SOLT",
    "tier": 80,
    "creator": "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC",
    "imageUrl": "https://...",
    "closeTimestamp": 1715200000
  }'
```

Verify on BSCScan that:

1. `AgentTokenV3` was deployed with 1B supply.
2. `LaunchVault` holds 400M tokens: 200M presale inventory plus 200M launch liquidity inventory.
3. `BundleRouter` was deployed with the configured Flap portal address.
4. `TaxSplitter` was deployed for this agent with `[creator, platformWallet]` and `[9000, 1000]`.
5. `TreasuryReserve` was deployed and holds 100M tokens.
6. The `LaunchCreated` event includes `taxSplitter` and `treasuryReserve`.

## Step 5: Launch, refund, and tax checks

Before production rollout, smoke the full flow on testnet:

1. Create a launch.
2. Deposit until the tier cap is reached.
3. Close and launch through `LaunchVault.launch(...)`.
4. Verify BundleRouter calls the Flap portal, the V2 pair exists, and V2 buy proceeds are burned.
5. Create an undersubscribed launch and verify `enableRefunds()` plus `refund()` returns principal and bonus pool share.
6. Trigger a taxed transfer and call `TaxSplitter.release(tokenAddress)` to verify 90% to creator and 10% to platform.

## Notes

- There is no standalone `packages/contracts-evm/scripts/deploy-launch-v3.*` file. The current deploy artifact is the unified `scripts/deploy/run.js` entrypoint with `DEPLOY_TARGET=launch-v3`, implemented in `scripts/deploy/tasks.js`.
- The factory no longer accepts `TAX_SPLITTER`. It accepts `PLATFORM_WALLET` and deploys one splitter per launch.
- The factory uses the Flap portal address from `scripts/addresses.js` for the selected network.
- The 10% treasury reserve is parked in `TreasuryReserve` until the audit firm signs off on V4 PoolManager pinning and TreasuryLP4 production wiring.
