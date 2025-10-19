# Launchpad Localnet Self-Contained Mode

## Overview

The Jeju launchpad is now **fully self-contained for localnet development**, requiring **zero external API dependencies**. This enables complete offline development and testing without relying on third-party services.

## What Changed

### External API Dependencies Removed

1. **Codex API** (Token pricing and market data)
   - **Before**: Required API key, crashed without it
   - **After**: Uses fallback prices on localnet, gracefully skips

2. **Helius RPC** (Solana network access)
   - **Before**: Hardcoded Helius URLs for all connections
   - **After**: Uses Jeju RPC on localnet

3. **Jupiter DEX** (Solana token swaps)
   - **Before**: Called Jupiter API for quotes and swaps
   - **After**: Skipped on localnet (Jeju is EVM-based, not Solana)

4. **Alchemy API** (Ethereum/Base RPC)
   - **Before**: Required for Ethereum/Base chains
   - **After**: Not needed on localnet (Jeju only)

### Auto-Detection System

The launchpad automatically detects localnet mode when:

1. `NEXT_PUBLIC_JEJU_NETWORK=localnet` environment variable is set
2. `JEJU_RPC_URL` points to localhost or 127.0.0.1
3. No external API keys configured in development mode

## Architecture

### Backend Changes

**File**: `apps/launchpad/packages/utils/src/localnet.ts`
```typescript
export function isLocalnet(): boolean {
  // Checks environment variables and RPC URLs
  // Returns true if running on localnet
}

export function shouldSkipExternalAPIs(): boolean {
  return isLocalnet();
}
```

**File**: `apps/launchpad/packages/utils/src/index.ts`
```typescript
// Codex API is now optional
export const codex = CODEX_API_KEY ? new Codex(CODEX_API_KEY) : null;

// Pricing uses fallbacks on localnet
export const updateCryptoPrices = async () => {
  if (shouldSkipExternalAPIs()) {
    return FALLBACK_PRICES; // No external API call
  }
  // ... normal Codex API call
};
```

**File**: `apps/launchpad/apps/backend/src/routers/tokens.ts`
```typescript
// Skip Codex for completed curves on localnet
if (token.curveCompleted && !shouldSkipExternalAPIs() && codex) {
  // ... Codex API call
}
```

**File**: `apps/launchpad/apps/backend/src/routers/prices.ts`
```typescript
fastify.post("/", async () => {
  if (shouldSkipExternalAPIs()) {
    return FALLBACK_PRICES; // Instant response, no API calls
  }
  // ... normal Codex pricing
});

// New endpoint for Jeju pricing
fastify.post("/jeju", async () => {
  if (shouldSkipExternalAPIs()) {
    return { ethereum: FALLBACK_PRICES.ethereum };
  }
  // ... normal pricing
});
```

### Frontend Changes

**File**: `apps/launchpad/apps/frontend/src/lib/localnet.ts`
```typescript
export function isLocalnet(): boolean {
  // Frontend version of localnet detection
}
```

**File**: `apps/launchpad/apps/frontend/src/lib/utils.ts`
```typescript
// Jupiter API skipped on localnet
export const retrieveJupiterQuote = async (...) => {
  if (shouldSkipExternalAPIs()) {
    return { minimumReceived: 0, swapUsdValue: "0", priceImpactPct: "0" };
  }
  // ... normal Jupiter API call
};

// Helius RPC skipped on localnet
export const retrieveAutofunQuote = async (...) => {
  if (!shouldSkipExternalAPIs()) {
    connection = new Connection(HELIUS_RPC_URL, "finalized");
  }
  // Uses existing connection on localnet
};
```

**File**: `apps/launchpad/apps/frontend/src/lib/api.ts`
```typescript
// Use Jeju RPC on localnet
export const HELIUS_RPC_URL = shouldSkipExternalAPIs()
  ? process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545"
  : /* Helius URLs */;
```

## Local Infrastructure Stack

### Required Services (Docker Compose)

File: `apps/launchpad/docker-compose.localnet.yml`

1. **PostgreSQL** (port 5432)
   - Token metadata
   - User data
   - Trade history

2. **Redis** (port 6379)
   - Price caching
   - Rate limiting
   - Session management

3. **MongoDB** (port 27017)
   - Token documents
   - Historical data

4. **Blockscout** (port 4000) - Optional
   - Block explorer
   - Transaction viewer

### Jeju L2 Node

**External dependency** - Must be running separately:
```bash
# From root of Jeju monorepo
bun run dev
```

This starts the Jeju L2 RPC node on `http://127.0.0.1:9545`

## Environment Configuration

### Minimal Localnet Setup

```bash
# .env
NEXT_PUBLIC_JEJU_NETWORK=localnet
NEXT_PUBLIC_JEJU_RPC_URL=http://127.0.0.1:9545
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Backend
JEJU_NETWORK=localnet
JEJU_RPC_URL=http://127.0.0.1:9545
DATABASE_URL=postgresql://autofun:autofun_dev_password@localhost:5432/autofun
MONGODB_URI=mongodb://autofun:autofun_dev_password@localhost:27017/autofun
REDIS_URL=redis://localhost:6379
```

### Production Setup (With External APIs)

```bash
# .env
NEXT_PUBLIC_JEJU_NETWORK=mainnet
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_key
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_key
CODEX_API_KEY=your_codex_key
```

## Usage

### Start Launchpad on Localnet

```bash
# 1. Start infrastructure
cd apps/launchpad
docker compose -f docker-compose.localnet.yml up -d

# 2. Start Jeju L2 node (if not already running)
cd ../..
bun run dev

# 3. Configure environment
export NEXT_PUBLIC_JEJU_NETWORK=localnet
export NEXT_PUBLIC_JEJU_RPC_URL=http://127.0.0.1:9545

# 4. Start launchpad
cd apps/launchpad
bun run dev
```

### Verify Self-Contained Mode

```bash
# Check that no external API calls are made
cd apps/launchpad
bun test tests/e2e/localnet-no-external-apis.test.ts
```

### Monitor Logs

```bash
# Backend logs should show:
# "Localnet detected - using fallback prices, skipping Codex API"
# "Skipping Codex queries - localnet mode or Codex not available"

# Frontend console should show:
# "Jupiter API skipped - localnet mode (Jeju is EVM-based)"
```

## Benefits

1. **✅ Offline Development**
   - Work without internet connection
   - No external service dependencies
   - Fast iteration cycles

2. **✅ Cost Savings**
   - No API usage fees during development
   - No rate limiting issues
   - Unlimited testing

3. **✅ Reliability**
   - No external service outages
   - Deterministic behavior
   - Reproducible testing

4. **✅ Privacy**
   - No data sent to third parties
   - Complete control over data
   - Secure development environment

5. **✅ Speed**
   - No network latency
   - Instant responses
   - Local database queries

## Testing

### Unit Tests

```bash
cd apps/launchpad
bun test tests/e2e/localnet-no-external-apis.test.ts
```

### Integration Tests

```bash
# Start full stack
docker compose -f docker-compose.localnet.yml up -d
bun run dev

# Run E2E tests
bun test tests/e2e/launchpad-localnet-e2e.test.ts
```

### Manual Testing

1. **Check Pricing**
   ```bash
   curl http://localhost:3001/api/prices -X POST
   # Should return: {"solana":153,"ethereum":2518}
   ```

2. **Check Token Data**
   ```bash
   curl http://localhost:3001/api/tokens/list -X POST \
     -H "Content-Type: application/json" \
     -d '{"chain":"evm","chainId":1337}'
   ```

3. **Verify No External Calls**
   ```bash
   # Monitor network traffic - should only see localhost calls
   # No calls to:
   # - codex-data.com
   # - helius-rpc.com
   # - jup.ag
   # - alchemy.com
   ```

## Troubleshooting

### Issue: Backend crashes with "Missing CODEX_API_KEY"

**Solution**: Make sure `JEJU_NETWORK=localnet` is set before starting backend

### Issue: Frontend shows no token prices

**Solution**: Check that fallback prices are being returned:
```bash
curl http://localhost:3001/api/prices -X POST
```

### Issue: Solana-related errors on localnet

**Solution**: This is expected - Jeju is EVM-based. Solana functionality is gracefully skipped on localnet.

### Issue: Docker containers not starting

**Solution**: Check ports are available:
```bash
# PostgreSQL: 5432
# Redis: 6379
# MongoDB: 27017
# Blockscout: 4000
lsof -i :5432
lsof -i :6379
lsof -i :27017
```

## Future Enhancements

1. **Local Uniswap V4 Pricing**
   - Query local Uniswap V4 pools for ETH price
   - Calculate token prices from on-chain data

2. **Local Indexer Integration**
   - Use local indexer for token data
   - Real-time updates from Jeju L2 events

3. **Mock Trading**
   - Simulate token swaps without blockchain
   - Testing UI/UX without gas fees

4. **Performance Optimizations**
   - Cache bonding curve calculations
   - Pre-compute token prices
   - Optimize database queries

## Related Documentation

- [Launchpad README](../README.md)
- [Multi-Chain Integration](JEJU_INTEGRATION.md)
- [E2E Testing Guide](../tests/e2e/README.md)
- [Docker Setup](../docker-compose.localnet.yml)

## Support

For issues or questions:
1. Check this documentation
2. Review logs: `docker compose logs -f`
3. Open GitHub issue with "launchpad-localnet" label

