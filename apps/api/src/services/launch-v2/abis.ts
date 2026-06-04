/**
 * Minimal ABI fragments needed for the launch API to read on-chain state and
 * submit createLaunch transactions. Trimmed from the contracts-evm artifacts
 * to avoid pulling the full hardhat output into the API bundle.
 *
 * Authoritative source: packages/contracts-evm/contracts/{LaunchFactory,LaunchVault,BundleRouter}.sol
 */

export const launchFactoryAbi = [
	{
		type: "function",
		name: "createLaunch",
		stateMutability: "nonpayable",
		inputs: [
			{
				name: "config",
				type: "tuple",
				components: [
					{ name: "name", type: "string" },
					{ name: "symbol", type: "string" },
					{ name: "metaCid", type: "string" },
					{ name: "creator", type: "address" },
					{ name: "bundleBot", type: "address" },
					{ name: "tier", type: "uint8" },
					{ name: "buyTaxBps", type: "uint16" },
					{ name: "sellTaxBps", type: "uint16" },
					{ name: "taxDuration", type: "uint64" },
					{ name: "antiFarmerDuration", type: "uint64" },
					{ name: "closeTimestamp", type: "uint256" },
					{ name: "vanitySalt", type: "bytes32" },
					{ name: "predictedTokenAddress", type: "address" },
					{ name: "noBurn", type: "bool" },
					{ name: "platformReceiver", type: "address" },
					{ name: "patron", type: "address" },
					{ name: "agentSafeOwners", type: "address[]" },
					{ name: "agentSafeThreshold", type: "uint256" },
					{ name: "platformBps", type: "uint16" },
					{ name: "patronBps", type: "uint16" },
					// Wave O.1 LP5: PancakeV3 treasury tick ranges per LP tier. The
					// deployed factory's createLaunch expects these (selector
					// 0x3323a9e5). Omitting them sends the wrong calldata and the
					// launch reverts with `execution reverted: 0x`.
					{ name: "treasuryTickLowers", type: "int24[4]" },
					{ name: "treasuryTickUppers", type: "int24[4]" },
				],
			},
		],
		outputs: [
			{
				name: "addrs",
				type: "tuple",
				components: [
					{ name: "vault", type: "address" },
					{ name: "router", type: "address" },
					{ name: "treasuryLp", type: "address" },
					{ name: "predictedTokenAddress", type: "address" },
					{ name: "taxSplitter", type: "address" },
					{ name: "agentSafe", type: "address" },
				],
			},
		],
	},
	{
		type: "function",
		name: "tierConfig",
		stateMutability: "pure",
		inputs: [{ name: "tier", type: "uint8" }],
		outputs: [
			{ name: "presaleCapBnb", type: "uint256" },
			{ name: "quoteAmt", type: "uint256" },
			{ name: "v2BuyBnb", type: "uint256" },
			{ name: "vestingEnabled", type: "bool" },
		],
	},
	{
		type: "function",
		name: "launches",
		stateMutability: "view",
		inputs: [{ name: "token", type: "address" }],
		outputs: [
			{ name: "vault", type: "address" },
			{ name: "router", type: "address" },
			{ name: "treasuryLp", type: "address" },
			{ name: "predictedTokenAddress", type: "address" },
			{ name: "taxSplitter", type: "address" },
			{ name: "agentSafe", type: "address" },
		],
	},
	{
		type: "event",
		name: "LaunchCreated",
		inputs: [
			{ name: "launchId", type: "bytes32", indexed: true },
			{ name: "creator", type: "address", indexed: true },
			{ name: "predictedToken", type: "address", indexed: true },
			{ name: "vault", type: "address", indexed: false },
			{ name: "router", type: "address", indexed: false },
			{ name: "treasuryLp", type: "address", indexed: false },
			{ name: "taxSplitter", type: "address", indexed: false },
			{ name: "agentSafe", type: "address", indexed: false },
			{ name: "tier", type: "uint8", indexed: false },
			{ name: "presaleCap", type: "uint256", indexed: false },
			{ name: "v2BuyBnb", type: "uint256", indexed: false },
			{ name: "closeTimestamp", type: "uint256", indexed: false },
		],
		anonymous: false,
	},
] as const;

export const launchVaultAbi = [
	{
		type: "function",
		name: "state",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint8" }],
	},
	{
		type: "function",
		name: "totalDeposited",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "bonusPool",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "depositorCount",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		// On-chain storage var is `uint256 public presalerTokenBalance` (LaunchVault.sol),
		// which auto-generates a `presalerTokenBalance()` getter. The previous ABI name
		// `presaleTokens` did not exist on-chain and reverted every call — and since these
		// reads sit in allowFailure:false Promise.all batches, the whole vault read failed
		// (preview 500s, live state/depositor reads fall back to stale DB). The frontend ABI
		// was already corrected the same way (lib/launch-vault/abi.ts).
		type: "function",
		name: "presalerTokenBalance",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "closeTimestamp",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "launchTimestamp",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "function",
		name: "depositors",
		stateMutability: "view",
		inputs: [{ name: "user", type: "address" }],
		outputs: [
			{ name: "deposited", type: "uint256" },
			{ name: "claimed", type: "uint256" },
			{ name: "seen", type: "bool" },
		],
	},
	{
		type: "function",
		name: "claimableOf",
		stateMutability: "view",
		inputs: [{ name: "user", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
] as const;
