# Contract Verification Runbook

## What's verified where

| Contract | Address | BscScan | Sourcify |
|---|---|---|---|
| LaunchFactory | `0x54f250Ea490239E7C3B1672283607213B5fA2459` | ✅ verified | ✅ full match |

Links:
- https://bscscan.com/address/0x54f250Ea490239E7C3B1672283607213B5fA2459#code
- https://repo.sourcify.dev/contracts/full_match/56/0x54f250Ea490239E7C3B1672283607213B5fA2459/

## Why both?

- **Sourcify** = open verifier. No API key. Used by ChainList, MetaMask, Otterscan, RotkiHQ. Critical for trustless verification.
- **BscScan** = BNB Chain block explorer. The "verified" green checkmark users + reviewers (DappBay, etc.) actually look at. Requires free API key.

## Verify a fresh deployment

```bash
cd packages/contracts-evm

# LaunchFactory
npx hardhat verify \
  --network bscMainnet \
  --constructor-args scripts/verify/launch-factory-args.js \
  <ADDRESS>
```

This tries BOTH BscScan (if BSCSCAN_API_KEY set in env) AND Sourcify (no key needed). Either may succeed independently — that's fine.

## Per-launch contracts

When `LaunchFactory.createLaunch()` is called, it deploys three new contracts via CREATE/CREATE2:
- `BundleRouter`
- `LaunchVault`
- `TreasuryLP`

These need separate verification per launch. Use the constructor args printed by the indexer's launch event (or extract from the tx trace).

TODO: write a post-launch hook that auto-submits all three to Sourcify + BscScan.

## Get an Etherscan V2 API key (if needed)

Etherscan V2 unified API: one key works across BSC, Polygon, Arbitrum, Base, Optimism, etc.

1. Go to https://etherscan.io/myapikey (sign up if needed, free)
2. Create a new key
3. Set in env: `ETHERSCAN_API_KEY=<key>` (or legacy `BSCSCAN_API_KEY=<key>`) in `packages/contracts-evm/.env`
4. Re-run `npx hardhat verify ...` — both BscScan and Sourcify will be tried

The legacy V1 endpoint (`bscscan.com/api`) was deprecated May 31 2025. hardhat-verify v2 uses V2 by default.

## DappBay submission

DappBay (https://dappbay.bnbchain.org/submit) requires verified contracts on BscScan. Sourcify is a nice-to-have for trustless verification but **DappBay specifically wants the BscScan verification badge**.

Steps:
1. Get BSCSCAN_API_KEY → run verify script for each deployed contract
2. Confirm the green "Contract Source Code Verified" badge on https://bscscan.com/address/<addr>#code
3. Submit to DappBay with the BscScan link as proof
