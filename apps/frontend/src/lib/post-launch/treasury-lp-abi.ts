/**
 * Minimal TreasuryLP ABI (W50 post-launch agent page reads only).
 *
 * Source: packages/contracts-evm/contracts/TreasuryLP.sol
 *
 * Only the views the tier ladder + tax stream stats panels need. Trimmed
 * on purpose: the full Hardhat artifact would balloon the bundle.
 *
 * The tiers() getter returns the public Tier struct as a positional tuple
 * (Solidity-generated). Field order mirrors the struct declaration:
 *   targetMcUSD, tokenAmount, tickLower, tickUpper, minEpochs,
 *   epochsAbove, lastEpochTimestamp, deployed, paused, positionId.
 */
export const treasuryLpAbi = [
	{
		type: "function",
		stateMutability: "view",
		name: "currentMcUSD",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "nextTierIndex",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "tiers",
		inputs: [{ name: "", type: "uint256" }],
		outputs: [
			{ name: "targetMcUSD", type: "uint256" },
			{ name: "tokenAmount", type: "uint256" },
			{ name: "tickLower", type: "int24" },
			{ name: "tickUpper", type: "int24" },
			{ name: "minEpochs", type: "uint8" },
			{ name: "epochsAbove", type: "uint8" },
			{ name: "lastEpochTimestamp", type: "uint32" },
			{ name: "deployed", type: "bool" },
			{ name: "paused", type: "bool" },
			{ name: "positionId", type: "uint256" },
		],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "tierDeployed",
		inputs: [{ name: "idx", type: "uint256" }],
		outputs: [{ name: "", type: "bool" }],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "epochsTowardTier",
		inputs: [{ name: "idx", type: "uint256" }],
		outputs: [
			{ name: "current", type: "uint8" },
			{ name: "required", type: "uint8" },
		],
	},
	{
		type: "function",
		stateMutability: "view",
		name: "tokenSupply",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "event",
		name: "TierDeployed",
		inputs: [
			{ name: "tierIdx", type: "uint8", indexed: true },
			{ name: "positionId", type: "uint256", indexed: true },
			{ name: "liquidity", type: "uint128", indexed: false },
			{ name: "tokenAmount", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "BuybackExecuted",
		inputs: [
			{ name: "bnbSpent", type: "uint256", indexed: false },
			{ name: "tokensBurned", type: "uint256", indexed: false },
		],
	},
] as const;
