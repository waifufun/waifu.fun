The new TreasuryLP claim path ignores one side of V4 fee accruals, which can prevent or lose access to token-side LP proceeds. This is a functional issue in the added contract.

Review comment:

- [P2] Handle token-side fees during claim — /home/shad0w/projects/waifu.fun-wt/codex-retro-review/packages/contracts-evm/contracts/TreasuryLP.sol:268-268
  When a V4 position has accrued fees in the agent-token currency (for example, trades into the BNB/token pool), `collect` returns those amounts but this call discards `amount0`/`amount1` and the function later only computes the native BNB balance delta. Token-only fee accruals make `claim()` revert with `nothing_to_claim`, and mixed accruals leave the token fees stuck or accidentally counted as future tier inventory, so the agent cannot claim all LP proceeds.
