The new TreasuryLP claim path ignores one side of V4 fee accruals, which can prevent or lose access to token-side LP proceeds. This is a functional issue in the added contract.

Status: fixed by the Wave H security hardening branch. Current `TreasuryLP` and `TreasuryLP4` claim paths account for token-side fee deltas and forward token fees to the agent safe.

Finding:

- [P2] Handle token-side fees during claim - `packages/contracts-evm/contracts/TreasuryLP.sol:268`
  When a V4 position has accrued fees in the agent-token currency (for example, trades into the BNB/token pool), `collect` returns those amounts but this call discards `amount0`/`amount1` and the function later only computes the native BNB balance delta. Token-only fee accruals make `claim()` revert with `nothing_to_claim`, and mixed accruals leave the token fees stuck or accidentally counted as future tier inventory, so the agent cannot claim all LP proceeds.
