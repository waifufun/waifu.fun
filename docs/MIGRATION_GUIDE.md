## Migration Guide: Multi-Chain Support

This guide helps existing developers migrate to the new multi-chain architecture with Jeju and BSC support.

## Overview

The migration introduces:
- **Jeju** support (mainnet, testnet, localnet)
- **BSC** (Binance Smart Chain) support
- **Chain availability system** - chains show/hide based on environment configuration
- **Localnet-first development** - Jeju is the default, other chains require API keys

## Breaking Changes

### 1. Environment Variables

**New Required Variables:**
```bash
# Required
NEXT_PUBLIC_JEJU_NETWORK=mainnet  # or testnet, localnet

# Optional (chains hidden without these)
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key        # For Base/Ethereum
NEXT_PUBLIC_BSC_RPC_URL=https://...         # For BSC
NEXT_PUBLIC_HELIUS_API_KEY=your_key         # For Solana
```

**Action Required:**
1. Copy `.env.example` to `.env.local`
2. Set `NEXT_PUBLIC_JEJU_NETWORK`
3. Add API keys for chains you want to support

### 2. Chain ID Constants

**Before:**
```typescript
// Old hard-coded chain IDs
const CHAIN_ID = 8453; // Base only
```

**After:**
```typescript
import { EvmChainIds } from "@autofun/constants";

const chainId = EvmChainIds.JejuMainnet;  // 420691
const chainId = EvmChainIds.BaseMainnet;  // 8453
const chainId = EvmChainIds.BSCMainnet;   // 56
```

**Action Required:**
- Replace hard-coded chain IDs with enum values
- Import `EvmChainIds` from `@autofun/constants`

### 3. Provider Changes

**Before:**
```tsx
// No EVM provider in launchpad
<SolanaProvider>
  {children}
</SolanaProvider>
```

**After:**
```tsx
import { EvmProvider } from "@/providers/evm-provider";

<EvmProvider>
  <SolanaProvider>
    {children}
  </SolanaProvider>
</EvmProvider>
```

**Action Required:**
- Update `app/providers.tsx` to wrap with `EvmProvider`
- Ensure WalletConnect project ID is set

### 4. Chain Availability Checks

**Before:**
```typescript
// Always showed all chains
const chains = [base, bsc, ethereum];
```

**After:**
```typescript
import { shouldShowChain, getAvailableEvmChains } from "@/lib/chain-availability";

// Only show available chains
const availableChains = getAvailableEvmChains()
  .filter(c => c.available)
  .map(c => CHAINID_TO_VIEM_CHAIN[c.chainId]);
```

**Action Required:**
- Use `shouldShowChain()` before rendering chain-specific UI
- Call `logChainAvailability()` in development mode

## Migration Steps

### For Launchpad Developers

#### Step 1: Update Dependencies

```bash
cd apps/launchpad
bun install
```

#### Step 2: Update Environment

```bash
cp .env.example .env.local

# Edit .env.local
NEXT_PUBLIC_JEJU_NETWORK=localnet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Optional: Add for Base support
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key
```

#### Step 3: Update Chain References

Find and replace hard-coded chain IDs:

```typescript
// Before
if (chainId === 8453) { ... }

// After
import { EvmChainIds } from "@autofun/constants";
if (chainId === EvmChainIds.BaseMainnet) { ... }
```

#### Step 4: Update Contract Addresses

```typescript
// Before
const WETH_ADDRESS = "0x..."; // Hard-coded

// After
import { WETH_ADDRESSES, EvmChainIds } from "@autofun/constants";
const wethAddress = WETH_ADDRESSES[chainId];
```

#### Step 5: Test

```bash
# Validate environment
bun run validate:env

# Start localnet
bun run localnet:start

# Run dev server
bun run dev

# Run tests
bun run test
```

### For OTC Agent Developers

#### Step 1: Update Wagmi Configuration

The wagmi client now dynamically loads chains based on environment.

**Before:**
```typescript
const config = createConfig({
  chains: [base, hardhat],
  // ...
});
```

**After:**
```typescript
// Now handled automatically in lib/wagmi-client.ts
import { config, chains } from "@/lib/wagmi-client";

// Chains are filtered based on env vars
// Use `chains` export to see what's available
```

#### Step 2: Update Multi-Wallet Context

The context now includes Jeju detection:

```typescript
import { useMultiWallet } from "@/components/multiwallet";

function MyComponent() {
  const { isJejuChain, currentChainId } = useMultiWallet();

  if (isJejuChain) {
    // Show Jeju-specific UI
  }
}
```

#### Step 3: Update Chain Indicators

```typescript
// Chain indicator automatically detects Jeju
import { ChainIndicator } from "@/components/chain-indicator";

<ChainIndicator /> // Shows "Jeju", "Base", "BSC", etc.
```

#### Step 4: Test

```bash
cd apps/thedesk

# Start localnet
bun run localnet:start

# Run dev
bun run dev

# Run tests
bun run test
```

## Common Migration Issues

### Issue 1: "Chain not available"

**Symptom:** Chain selector doesn't show Base or BSC

**Solution:**
```bash
# Add to .env.local
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key  # For Base
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org
```

### Issue 2: "Contract not deployed"

**Symptom:** Transactions fail with "contract not found"

**Solution:**
```bash
# Deploy contracts to Jeju using Forge
cd apps/launchpad
bun run deploy:jeju
```

### Issue 3: Wrong network in wallet

**Symptom:** Wallet shows different network than app

**Solution:**
1. Add Jeju network to wallet manually
2. Chain ID: 1337 (localnet), 420690 (testnet), 420691 (mainnet)
3. RPC URL: http://127.0.0.1:9545 (localnet)

### Issue 4: TypeScript errors

**Symptom:** `EvmChainIds` not found

**Solution:**
```bash
# Rebuild packages
cd apps/launchpad
bun run build

# Or rebuild types package specifically
cd packages/types
bun run build
```

## API Changes

### Chain Availability

```typescript
// New API
import {
  shouldShowChain,
  getAvailableEvmChains,
  logChainAvailability
} from "@/lib/chain-availability";

// Check if chain should be shown
if (shouldShowChain(EvmChainIds.BaseMainnet)) {
  // Render Base UI
}

// Get all available chains
const chains = getAvailableEvmChains();
chains.forEach(({ chainId, available, reason }) => {
  console.log(`${chainId}: ${available ? 'available' : reason}`);
});

// Log availability (dev only)
logChainAvailability();
```

### Multi-Wallet Updates

```typescript
// New fields in OTC agent
const {
  currentChainId,  // number | null
  isJejuChain,     // boolean
  // ... existing fields
} = useMultiWallet();
```

## Testing Your Migration

### Checklist

- [ ] Environment variables set correctly
- [ ] `validate:env` script passes
- [ ] Jeju appears in chain selector
- [ ] Other chains appear when API keys are set
- [ ] Other chains hidden when API keys are not set
- [ ] Can connect wallet to Jeju Localnet
- [ ] Can create tokens on Jeju
- [ ] Can switch between Jeju networks
- [ ] TypeScript compiles without errors
- [ ] Tests pass

### Test Commands

```bash
# Environment validation
bun run validate:env

# Unit tests
bun run test

# Integration tests
bun run test:integration

# E2E tests
bun run test:e2e

# Start localnet
bun run localnet:start

# Stop localnet
bun run localnet:stop
```

## Deployment Considerations

### Production Environment

```bash
# Production .env
NEXT_PUBLIC_JEJU_NETWORK=mainnet
NEXT_PUBLIC_ALCHEMY_API_KEY=prod_key
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=prod_project_id

# Deploy contracts
bun run deploy:jeju
```

### Staging Environment

```bash
# Staging .env
NEXT_PUBLIC_JEJU_NETWORK=testnet
# ... other vars
```

## Rollback Plan

If you need to rollback:

1. **Revert environment variables:**
   ```bash
   # Remove Jeju-specific vars
   unset NEXT_PUBLIC_JEJU_NETWORK
   unset JEJU_RPC_URL
   ```

2. **Revert code changes:**
   ```bash
   git revert <commit-hash>
   ```

3. **Rebuild:**
   ```bash
   bun install
   bun run build
   ```

## Getting Help

- **Documentation:** See `JEJU_INTEGRATION.md` for detailed integration guide
- **Examples:** Check `apps/launchpad/tests/` for code examples
- **Issues:** Report problems at [GitHub Issues](https://github.com/elizaos/autofun-monorepo/issues)

## Next Steps

1. Complete migration using checklist above
2. Test thoroughly in localnet
3. Deploy to testnet
4. Deploy to mainnet

For detailed integration instructions, see `JEJU_INTEGRATION.md`.
