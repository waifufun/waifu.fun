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
					{ name: "metadataURI", type: "string" },
					{ name: "creator", type: "address" },
					{ name: "tier", type: "uint8" },
					{ name: "closeTimestamp", type: "uint256" },
				],
			},
		],
		outputs: [
			{
				name: "addrs",
				type: "tuple",
				components: [
					{ name: "token", type: "address" },
					{ name: "vault", type: "address" },
					{ name: "router", type: "address" },
					{ name: "taxSplitter", type: "address" },
					{ name: "treasuryReserve", type: "address" },
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
			{ name: "token", type: "address" },
			{ name: "vault", type: "address" },
			{ name: "router", type: "address" },
			{ name: "taxSplitter", type: "address" },
			{ name: "treasuryReserve", type: "address" },
		],
	},
	{
		type: "event",
		name: "LaunchCreated",
		inputs: [
			{ name: "creator", type: "address", indexed: true },
			{ name: "token", type: "address", indexed: true },
			{ name: "vault", type: "address", indexed: false },
			{ name: "router", type: "address", indexed: false },
			{ name: "taxSplitter", type: "address", indexed: false },
			{ name: "treasuryReserve", type: "address", indexed: false },
			{ name: "tier", type: "uint8", indexed: false },
			{ name: "presaleCap", type: "uint256", indexed: false },
			{ name: "v2BuyBnb", type: "uint256", indexed: false },
			{ name: "vestingEnabled", type: "bool", indexed: false },
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
		type: "function",
		name: "presaleTokens",
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
