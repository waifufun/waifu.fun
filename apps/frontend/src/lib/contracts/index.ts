// Contract addresses — set via env vars after deployment
export const CONTRACTS = {
	waifuToken: process.env.NEXT_PUBLIC_WAIFU_TOKEN_ADDRESS as `0x${string}` | undefined,
	veWaifuStaking: process.env.NEXT_PUBLIC_VEWAIFU_STAKING_ADDRESS as `0x${string}` | undefined,
	feeRouter: process.env.NEXT_PUBLIC_FEE_ROUTER_ADDRESS as `0x${string}` | undefined,
	waifuFunV2: process.env.NEXT_PUBLIC_WAIFUFUN_V2_ADDRESS as `0x${string}` | undefined,
	agentFactory: process.env.NEXT_PUBLIC_AGENT_FACTORY_ADDRESS as `0x${string}` | undefined,
} as const;

// Minimal ABIs for frontend interactions (not full ABIs, just what we call)

export const VE_WAIFU_STAKING_ABI = [
	{
		name: "stake",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "amount", type: "uint256" }],
		outputs: [],
	},
	{
		name: "withdraw",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "amount", type: "uint256" }],
		outputs: [],
	},
	{ name: "claimReward", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
	{ name: "exit", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
	{
		name: "balanceOf",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ type: "uint256" }],
	},
	{ name: "totalStaked", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
	{
		name: "earned",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ type: "uint256" }],
	},
	{
		name: "rewardPerTokenStored",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "uint256" }],
	},
] as const;

export const AGENT_FACTORY_ABI = [
	{
		name: "createAgent",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "name", type: "string" },
			{ name: "symbol", type: "string" },
			{ name: "totalSupply", type: "uint256" },
			{ name: "agentTreasury", type: "address" },
		],
		outputs: [{ type: "address" }],
	},
	{ name: "totalAgents", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
	{ name: "getAgentTokens", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
	{
		name: "isAgentToken",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "token", type: "address" }],
		outputs: [{ type: "bool" }],
	},
] as const;

export const ERC20_ABI = [
	{
		name: "approve",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ type: "bool" }],
	},
	{
		name: "allowance",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [{ type: "uint256" }],
	},
	{
		name: "balanceOf",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ type: "uint256" }],
	},
	{ name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
	{ name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
	{ name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
