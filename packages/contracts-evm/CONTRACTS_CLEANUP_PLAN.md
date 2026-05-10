# Contracts Cleanup Plan

Date: 2026-05-10
Branch: `sol/wave-cleanup-contracts`

## v3 contract catalog

- `LaunchFactory`: deploys per-agent token, vault, router, TaxSplitter, and TreasuryReserve, then allocates the 1B supply as 500M burn, 400M vault inventory, 100M treasury reserve.
- `LaunchVault`: BNB presale state machine, deposit and withdraw window, close, launch handoff, under-subscribed refunds, vesting claims.
- `BundleRouter`: vault-owned launch executor, Flap Portal curve fill when available, fallback LP seed, PCS V2 buy and burn, open MC event accounting.
- `AgentTokenV3`: fixed-supply taxed ERC20 with bootstrap-only tax exemptions and per-agent splitter destination.
- `TaxSplitter`: fixed recipient and bps splitter for native BNB and ERC20 tax balances.
- `TreasuryReserve`: creator-controlled parked treasury-token holder until TreasuryLP4 production wiring is audit-ready.
- `TreasuryLP`: legacy 12-tier LP manager, still covered but not the v3 mainline reserve path.
- `TreasuryLP4`: v3 4-tier LP manager scoped to the 100M treasury reserve, still dependent on real PCS Infinity PoolManager review.

## mock catalog

- `ERC20Mock`: generic ERC20 fixture for vault, splitter, and treasury unit tests. keep.
- `LaunchRouterMocks.sol`: `MockFlapPortal` and `MockFlapToken` stand in for Flap Portal and TOKEN_TAXED_V3 for local non-fork tests. real fork fixture exists for Portal `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`, but local mocks stay for deterministic unit coverage.
- `MockLaunchRouter`: minimal LaunchVault router sink for state-machine tests. keep.
- `MockPancakeSwap`: PCS V2 local fixture for v2 E2E/deploy local tests. real PCS V2 router is `0x10ED43C718714eb63d5aA57B78B54704E256024E`. keep for non-fork tests.
- `MockWAIFU`: local WAIFU deploy fixture for v2 stack. keep.
- `SafeMocks`: Safe proxy and roles modifier fixtures for AgentSafeFactory. keep.
- `TreasuryLPMocks`: V2 pair/router, BNB/USD feed, and speculative V4 PoolManager fixtures for treasury unit tests. real V4 PoolManager remains unpinned/speculative, so keep.
- `LaunchVaultReentrantReceiver`: new adversarial receiver fixture for withdraw/refund reentrancy tests. keep.

## completed changes

- Consolidated duplicate PancakeSwap V2 router/factory/pair fragments into `contracts/interfaces/IPancakeSwap.sol`.
- Consolidated duplicate TreasuryLP dependency interfaces into `contracts/interfaces/ITreasuryLPDeps.sol`.
- Updated `BundleRouter`, `LaunchRouterMocks`, `TreasuryLP`, and `TreasuryLP4` to use shared interfaces.
- Preserved public ABIs. Changes are import/type cleanup plus tests and scripts.
- Fixed Hardhat BSC fork mode so `FORK_BSC=true` uses chain id `56` and an explicit chain 56 hardfork history on the in-process `hardhat` network. This addresses the EDR unknown-hardfork path, but public non-archive RPCs still fail historical pin `97368808` with `missing trie node`; use `ALCHEMY_BSC_URL`/archive RPC in CI.
- Added LaunchVault coverage for:
  - bonus-pool-inclusive curve/V2 split,
  - under-subscribed close and refund idempotence,
  - withdraw/refund reentrancy attempts,
  - post-attack accounting preservation.
- Added `gas:snapshot`, a gas baseline document, and a broad regression guard for core LaunchVault mutating paths.

## not changed

- Did not delete v1/v2 contracts or mocks because current tests/deploy scripts still reference them.
- Did not rename existing custom errors/events to avoid ABI/API/indexer churn immediately before audit.
- Did not add speculative V4 real-fork tests because the production PCS Infinity PoolManager address/ABI remains unpinned.
- Did not force fork tests to run locally without `FORK_BSC_URL`; CI should use canonical `ALCHEMY_BSC_URL` and `FORK_BSC_BLOCK=97368808`.
