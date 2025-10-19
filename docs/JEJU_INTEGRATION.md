# Jeju Integration Guide

## Overview

auto.fun now supports **Jeju**, **BSC**, **Base**, and **Solana**. This guide explains how to configure and use each chain.

## Quick Start

### Localnet Development

For local development, Jeju is enabled by default:

```bash
# 1. Start Jeju localnet (from repo root)
cd jeju
bun run scripts/localnet/start.ts

# 2. Start auto.fun
cd apps/launchpad
cp .env.example .env
bun install
bun run dev
```

**Default behavior**: Only Jeju is visible. Base and Solana require API keys.

### Adding Base Support

To enable Base:

```bash
# .env
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key_here
```

### Adding BSC Support

To enable BSC:

```bash
# .env
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org
```

### Adding Solana Support

To enable Solana:

```bash
# .env
NEXT_PUBLIC_HELIUS_API_KEY=your_key_here
```

## Chain Configuration

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_JEJU_NETWORK` | Jeju network (mainnet/testnet/localnet) | Yes |
| `JEJU_RPC_URL` | Jeju RPC endpoint | No (defaults to localnet) |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Base/Ethereum chain support | No |
| `NEXT_PUBLIC_HELIUS_API_KEY` | Solana support | No |
| `NEXT_PUBLIC_BSC_RPC_URL` | BSC support | No |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | EVM wallet support | Yes for EVM chains |

### Network Selection

Users select a chain when creating tokens:
1. Click "Create Token"
2. Select network from dropdown
3. Connect wallet for selected network

## Supported Networks

### Jeju Mainnet
- **Chain ID**: `420691`
- **RPC**: `https://rpc.jeju.network`
- **Explorer**: `https://explorer.jeju.network`
- **Native Currency**: ETH
- **Status**: ✅ Always available

### Jeju Testnet
- **Chain ID**: `420690`
- **RPC**: `https://testnet-rpc.jeju.network`
- **Explorer**: `https://testnet-explorer.jeju.network`
- **Native Currency**: ETH
- **Status**: ✅ Always available

### Jeju Localnet
- **Chain ID**: `1337`
- **RPC**: `http://127.0.0.1:9545`
- **Explorer**: `http://localhost:4000`
- **Native Currency**: ETH
- **Status**: ✅ Available in dev mode

### Base Mainnet
- **Chain ID**: `8453`
- **Status**: ⚠️ Requires `ALCHEMY_API_KEY`

### BSC Mainnet
- **Chain ID**: `56`
- **Status**: ⚠️ Requires `BSC_RPC_URL`

### Solana Mainnet
- **Network ID**: `101`
- **Status**: ⚠️ Requires `HELIUS_API_KEY`

## Troubleshooting

### "Chain not available"

**Cause**: Missing API key or RPC URL

**Fix**: Add required env var and restart:
```bash
# Add to .env
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key
# or
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org

# Restart
bun run dev
```

### "Contract not deployed"

**Cause**: Contracts not deployed to Jeju

**Fix**: Deploy contracts:
```bash
cd apps/launchpad
bun run deploy:jeju
```

### "Wrong network"

**Cause**: Wallet connected to different network

**Fix**: Switch network in your wallet to match the selected chain

### Console warnings about hidden chains

This is **normal** in localnet mode! Chains without API keys are intentionally hidden.

To enable them, add the required environment variables.

## Development Workflow

### 1. Start Jeju Localnet

```bash
# From repo root
cd jeju
bun run scripts/localnet/start.ts
```

Wait for: "✅ Jeju Localnet ready"

### 2. Deploy Contracts (First Time)

```bash
cd apps/launchpad
bun run deploy:jeju
```

### 3. Start Launchpad

```bash
cd apps/launchpad
bun run dev
```

### 4. Access Application

- **Frontend**: http://localhost:3330
- **Backend API**: http://localhost:3331
- **Block Explorer**: http://localhost:4000

## Production Deployment

### Environment Variables

```bash
# Production .env
NEXT_PUBLIC_JEJU_NETWORK=mainnet
NEXT_PUBLIC_ALCHEMY_API_KEY=prod_key
NEXT_PUBLIC_HELIUS_API_KEY=prod_key
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=prod_project_id

# Database
MONGO_URI=mongodb://prod-host:27017/autofun
REDIS_HOST=prod-redis-host

# Secrets
JWT_SECRET=generate_strong_secret_here
```

### Contract Addresses

Update contract addresses for each network in your deployment:

**Jeju Mainnet**:
- Uniswap V4 Router: `0x...` (TODO: Deploy)
- WETH: `0x4200000000000000000000000000000000000006`

**BSC Mainnet**:
- PancakeSwap Router: `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4`
- WBNB: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`

## API Reference

### Check Chain Availability

```typescript
import { shouldShowChain } from "@/lib/chain-availability";
import { EvmChainIds } from "@autofun/constants";

const isJejuAvailable = shouldShowChain(EvmChainIds.JejuMainnet);
// Always true

const isBaseAvailable = shouldShowChain(EvmChainIds.BaseMainnet);
// True only if ALCHEMY_API_KEY is set
```

### Get Available Chains

```typescript
import { getAvailableEvmChains } from "@/lib/chain-availability";

const chains = getAvailableEvmChains();
// Returns array of { chainId, available, reason }
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/elizaos/autofun-monorepo/issues
- Documentation: https://docs.auto.fun
- Discord: https://discord.gg/autofun
