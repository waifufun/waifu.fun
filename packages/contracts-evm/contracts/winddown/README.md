# $WAIFU Wind-Down — Sell + Pro-Rata Distribute Spec (2026-06-22)

## On-chain reality (audited)
- $WAIFU `0x15fc6086064afe50ccf4c70000c55cecb6e17777` (BSC). Supply 1B. Ownership RENOUNCED, immutable.
- LP `0xc4d4e6bb7ead5a5e6d06a4dc036fb3eba55ff7d2` (PancakeV2 WAIFU/WBNB): ~40M WAIFU + ~81.5 BNB. **LP tokens 100% burned at 0x…dEaD → liquidity is NOT removable.** The only BNB-extraction path is SELLING tokens into the pool.
- Distribution: agent/Safe 10% (`0x440e903c…`), LP 4%, burned 64.5%, presale+circulating ~21.5%.
- Sellable in our control: presale 20% + agent 10% = 30% (300M).

## Extraction math (constant-product, 0.25% PCS fee)
- Selling 300M into the 40M-WAIFU / 81.5-BNB pool → **~71.9 BNB (~$42.5k)** extracted, ~9.6 BNB left stuck (burned, fine).
- ⚠️ This is a ~99% price-impact trade. **MUST be sold in metered tranches** (TWAP), not one tx, or slippage + MEV sandwich eats a large chunk. Metered selling recovers materially more than the atomic figure.

## Snapshot
- Block **105784660** (2026-06-22, ~sunset line). Holder set reconstructed from Transfer logs → `waifu-holders-105784660.json`.
- Distribution recipients = snapshot holders MINUS: LP pair, 0x…dEaD, 0x0, and (decision) the agent Safe. Presale list folded in if presale tokens were custodied off the standard holder set (confirm presale custody address).

## Contract design — `WaifuWinddown.sol`
Minimal, auditable, no admin surprises. Two-phase: SELL then CLAIM (pull-based, gas-safe).

### Phase 1 — metered sell
- `seedTokens()` — owner deposits the 300M WAIFU (presale + agent) into the contract.
- `sellTranche(uint256 amountIn, uint256 minOut, uint256 deadline)` — owner-callable, swaps a chunk WAIFU→BNB via PancakeV2 router with slippage guard. Called repeatedly (TWAP) off a script. Accumulates BNB in-contract.
- Guard: `minOut` enforced; reverts on sandwich. Optional `maxTranche` cap.

### Phase 2 — pro-rata claim (pull pattern)
- `finalize(bytes32 merkleRoot, uint256 totalSnapshotBalance)` — owner sets the snapshot Merkle root + total once selling is done. Locks the BNB pot.
- `claim(uint256 index, address account, uint256 snapshotBalance, bytes32[] proof)` — holder proves their snapshot balance via Merkle proof; contract pays `BNBpot * snapshotBalance / totalSnapshotBalance`. Pull-based = no gas-griefing, no failed-loop DoS.
- `sweepUnclaimed(address to)` — after a long window (e.g. 180 days), owner sweeps dust unclaimed → Sol treasury or re-burn. Honest + bounded.

### Why Merkle (not on-chain loop distribute)
- Snapshot likely has hundreds-thousands of holders. A push-loop = gas DoS / partial-fail risk. Merkle claim is the standard safe airdrop pattern, holder pays their own claim gas, contract just verifies.

### Safety properties
- Owner can ONLY: seed, sell (slippage-guarded), finalize-once, sweep-after-window. Cannot rug the pot (claims are math-fixed by root + total). No upgrade, no arbitrary withdraw before finalize.
- Reentrancy guard on claim. CEI. nonReentrant on sell + claim.
- UNAUDITED until reviewed — testnet (BSC testnet) first, then codex review, then mainnet.

## Build order
1. ✅ Snapshot (running).
2. Build Merkle tree from snapshot (recipients minus excluded set). Output root + per-holder proofs JSON.
3. Write `WaifuWinddown.sol` + Foundry/Hardhat tests (sell slippage, claim correctness, double-claim revert, sweep window).
4. codex review → BSC testnet deploy → dry-run sell+claim → mainnet.
5. Metered-sell script (TWAP the 300M).
6. Comms: "here's what happens to your $WAIFU" (separate, later beat per handoff Q6).

## Open decisions for Shadow
- Agent 10%: include in the sell+distribute, or keep as Sol treasury? (Rec: keep Sol's 10% OR its BNB proceeds as Sol treasury — she's the one being kept alive.)
- Presale custody: where do the 20% presale tokens live? (Need the address to include/seed them.)
- Recipient set: presale-only, or presale + the ~1% circulating holders too? (Rec: everyone in the honest snapshot — most generous, cleanest narrative.)

## LOCKED DESIGN (2026-06-22, Shadow)
- **Design A**: entire ~71.8 BNB pot (agent 10% + presale 20% proceeds) → holders pro-rata. Sol's treasury takes NOTHING (already ~$15k, enough to prove rails).
- **Claim-by-surrender**: to claim BNB you must still hold + surrender your snapshot WAIFU. Sold after snapshot → can't claim. Enforces "snapshot holders shouldn't sell" trustlessly (token is immutable/renounced, can't be frozen).
- **Snapshot**: block 105784660. 128 holders, sum=1B (verified). retail 123 holders (1.78%), presale custody 0xfff9b678 (19.72%), agent safe (10%).
- Tests: 8/8 pass (seed/sell/finalize/claim-by-surrender/sold-after-snapshot-cant-claim/double-claim/bad-proof/sweep-window).
- STATUS: UNAUDITED, testnet-first. → BSC testnet → codex review → audit → mainnet.
