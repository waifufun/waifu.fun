# scripts/deploy — Wave H deploy entrypoints

Two scripts live here. Use the matching one for the network.

## deploy-wave-h.js

For BSC mainnet and BSC testnet. Deploys a single `LaunchFactory`, persists the deployment record to `deployments/{network}.json`, and prints the BscScan verify command.

```bash
# BSC mainnet
PRIVATE_KEY=0x... \
PLATFORM_COMMISSION_RECEIVER=0x... \
bunx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet

# BSC testnet (Flap is not on testnet; you MUST supply mock addresses for
# FLAP_PORTAL, TOKEN_IMPL_TAXED_V3, and TIP_RECEIVER or the script aborts).
PRIVATE_KEY=0x... \
FLAP_PORTAL=0x... \
TOKEN_IMPL_TAXED_V3=0x... \
TIP_RECEIVER=0x... \
bunx hardhat run scripts/deploy/deploy-wave-h.js --network bscTestnet
```

### Required env

- `PRIVATE_KEY` — deployer EOA private key. Must hold enough BNB for the deploy (~0.05 BNB on mainnet).

### Optional env (override defaults)

- `WBNB`, `PCS_FACTORY`, `PCS_ROUTER`, `FLAP_PORTAL`, `TOKEN_IMPL_TAXED_V3`, `TIP_RECEIVER` — override individual address book entries.
- `PLATFORM_COMMISSION_RECEIVER` — recorded only; the factory does not take it as a constructor arg (it's a per-launch field on `BundleRouter.executeBundle`).

### Defaults (BSC mainnet)

| Field | Value |
|---|---|
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| PCS V2 factory | `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` |
| PCS V2 router | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| Flap portal | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` |
| TaxToken V3 impl | `0x024f18294970B5c76c0691b87f138A0317156422` |
| Tip receiver (48 Club) | `0x4848489f0b2BEdd788c696e2D79b6b69D7484848` |

The init code hash is derived in-script from the EIP-1167 minimal proxy formula in `WAVE_H_FLAP_NATIVE_SPEC.md` section 4.2.

## deploy-wave-h-local.js

For local hardhat. Deploys `LaunchFactory` plus a mock PCS V2 stack and a `MockFlapPortal` stub so the factory constructor succeeds. Note that `MockFlapPortal` matches the old `swapExactInput` ABI; phase 2A will replace it with `MockFlapPortalV6`. In phase 1 every `LaunchFactory` entrypoint reverts `WaveH:phase2` so the precise mock ABI doesn't matter, only that the address is non-zero.

```bash
npx hardhat node  # in one terminal
bunx hardhat run scripts/deploy/deploy-wave-h-local.js --network localhost
```

Optional: set `BUNDLE_BOT_ADDRESSES=0x...,0x...` to auto-fund bundle bot wallets with 100 ETH each from the deployer.

## What this does NOT deploy

Wave H deploys the factory only. Per-launch `LaunchVault`, `BundleRouter`, and `TreasuryLP` are created by `LaunchFactory.createLaunch()` at launch time. Each launch gets its own fresh set.
