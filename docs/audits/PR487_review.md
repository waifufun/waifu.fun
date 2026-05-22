The new 4-tier contract still enforces the old 12-tier 540M token cap, allowing invalid TreasuryLP4 configurations inconsistent with the 100M launch reserve. This can lead to deployments that fail when later tiers are reached.

Status: fixed by the Wave H security hardening branch. The current launch flow uses a per-launch `TreasuryLP`; `TreasuryLP4` remains covered by token-side fee handling but is no longer the active factory path.

Finding:

- [P2] Cap TreasuryLP4 tier tokens at the reserved 100M - `packages/contracts-evm/contracts/TreasuryLP4.sol:197`
  For TreasuryLP4, the launch flow reserves only 100M tokens for this contract and the new tests document 4 × 25M = 100M, but this copied 12-tier limit still accepts configurations up to 540M. If deployment accidentally supplies tier amounts above the 100M reserve, the contract can deploy with an invalid schedule and then later tiers will revert with `insufficient_tokens` (or require funding far beyond the intended 10% allocation), so the constructor should reject totals above the TreasuryLP4 allocation.
