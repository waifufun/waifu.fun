import { type Address, type Hex, concatHex, encodeFunctionData, getAddress, keccak256, parseAbi, toBytes } from "viem";

export type AgentLaunchChain = "bsc" | "solana" | "base" | "ethereum";

export interface AgentAutonomyConfig {
	maxPercentPortfolioPerTrade: number;
	maxTradesPer24h: number;
	whitelistedTargets: {
		pancakeRouterV3: string;
		pancakeRouterV2: string;
		elizacloudRelay: string;
	};
	whitelistedTokens: Record<string, string>;
}

export interface RoleScope {
	target: Address;
	selectors: readonly Hex[];
	executionOptions: "send" | "delegatecall" | "both";
	limits: {
		maxPercentPortfolioPerTrade: number;
		maxTradesPer24h: number;
		windowSeconds: number;
	};
	tokenAllowlist: readonly string[];
	calls: readonly Hex[];
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
// Keep this object aligned with LAUNCHPAD_WAVE_SPEC.md.
export const DEFAULT_AGENT_AUTONOMY = {
	// Per-trade limits
	maxPercentPortfolioPerTrade: 5, // 5%
	maxTradesPer24h: 10,

	// Whitelisted target contracts (BSC mainnet addresses)
	whitelistedTargets: {
		pancakeRouterV3: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
		pancakeRouterV2: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
		elizacloudRelay: "0x...", // TBD post-merge with eliza-cloud-v2
	},

	// Whitelisted token destinations (allowed swap targets)
	whitelistedTokens: {
		bnb: ZERO_ADDRESS, // native
		wbnb: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
		usdt: "0x55d398326f99059fF775485246999027B3197955",
		usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
		busd: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
		// agent's own token (added dynamically post-launch)
	},
} as const satisfies AgentAutonomyConfig;

export const WHITELISTED_TARGETS = {
	bsc: DEFAULT_AGENT_AUTONOMY.whitelistedTargets,
	solana: {
		pancakeRouterV3: "TBD",
		pancakeRouterV2: "TBD",
		elizacloudRelay: "TBD",
	},
	base: {
		pancakeRouterV3: "TBD",
		pancakeRouterV2: "TBD",
		elizacloudRelay: "TBD",
	},
	ethereum: {
		pancakeRouterV3: "TBD",
		pancakeRouterV2: "TBD",
		elizacloudRelay: "TBD",
	},
} as const;

export const PANCAKE_ROUTER_SELECTORS = [
	"0x38ed1739", // swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
	"0x8803dbee", // swapTokensForExactTokens(uint256,uint256,address[],address,uint256)
	"0x7ff36ab5", // swapExactETHForTokens(uint256,address[],address,uint256)
	"0x18cbafe5", // swapExactTokensForETH(uint256,uint256,address[],address,uint256)
	"0x414bf389", // exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
	"0xc04b8d59", // exactInput((bytes,address,uint256,uint256))
] as const satisfies readonly Hex[];

export const RELAY_SELECTORS = ["0x00000000"] as const satisfies readonly Hex[];

export const AGENT_ROLE_ID = keccak256(toBytes("waifu.agent.role"));
export const PATRON_ROLE_ID = keccak256(toBytes("waifu.patron.role"));

export const ROLES_V2_ABI = parseAbi([
	"function assignRoles(address module, bytes32[] roleKeys, bool[] memberOf)",
	"function allowTarget(bytes32 roleKey, address targetAddress, uint8 options)",
	"function scopeTarget(bytes32 roleKey, address targetAddress)",
	"function scopeFunction(bytes32 roleKey, address targetAddress, bytes4 functionSig, uint8[] options, bytes conditions, uint8 executionOptions)",
	"function setAllowance(bytes32 allowanceKey, uint128 balance, uint128 refill, uint64 period)",
]);

export function buildAgentRoleScopes(
	autonomy: AgentAutonomyConfig = DEFAULT_AGENT_AUTONOMY,
	agentTokenAddress?: Address,
): RoleScope[] {
	assertAutonomy(autonomy);
	const tokenAllowlist = Object.values(autonomy.whitelistedTokens).concat(agentTokenAddress ? [agentTokenAddress] : []);
	const targetEntries = [
		[autonomy.whitelistedTargets.pancakeRouterV2, PANCAKE_ROUTER_SELECTORS],
		[autonomy.whitelistedTargets.pancakeRouterV3, PANCAKE_ROUTER_SELECTORS],
		[autonomy.whitelistedTargets.elizacloudRelay, RELAY_SELECTORS],
	] as const;

	return targetEntries
		.filter(([target]) => isEvmAddress(target))
		.map(([target, selectors]) => {
			const normalizedTarget = getAddress(target);
			const scopeCalls = selectors.map((selector) =>
				encodeFunctionData({
					abi: ROLES_V2_ABI,
					functionName: "scopeFunction",
					args: [AGENT_ROLE_ID, normalizedTarget, selector, [1], encodeTokenAllowlistConditions(tokenAllowlist), 0],
				}),
			);
			return {
				target: normalizedTarget,
				selectors,
				executionOptions: "send" as const,
				limits: {
					maxPercentPortfolioPerTrade: autonomy.maxPercentPortfolioPerTrade,
					maxTradesPer24h: autonomy.maxTradesPer24h,
					windowSeconds: 24 * 60 * 60,
				},
				tokenAllowlist,
				calls: [
					encodeFunctionData({
						abi: ROLES_V2_ABI,
						functionName: "allowTarget",
						args: [AGENT_ROLE_ID, normalizedTarget, 0],
					}),
					...scopeCalls,
				],
			};
		});
}

export function buildAgentRoleConfigCalls(
	autonomy: AgentAutonomyConfig,
	agentAddress: Address,
	agentTokenAddress?: Address,
): Hex[] {
	const scopes = buildAgentRoleScopes(autonomy, agentTokenAddress);
	return [
		encodeFunctionData({
			abi: ROLES_V2_ABI,
			functionName: "assignRoles",
			args: [agentAddress, [AGENT_ROLE_ID], [true]],
		}),
		...scopes.flatMap((scope) => [...scope.calls]),
		...buildExecutionLimitCalls(autonomy),
	];
}

export function buildPatronRoleConfigCalls(patronAddresses: Address[]): Hex[] {
	return patronAddresses.map((patronAddress) =>
		encodeFunctionData({
			abi: ROLES_V2_ABI,
			functionName: "assignRoles",
			args: [patronAddress, [PATRON_ROLE_ID], [true]],
		}),
	);
}

export function concatenateRoleCalls(calls: readonly Hex[]): Hex {
	return calls.length === 0 ? "0x" : concatHex(calls);
}

function buildExecutionLimitCalls(autonomy: AgentAutonomyConfig): Hex[] {
	return [
		encodeFunctionData({
			abi: ROLES_V2_ABI,
			functionName: "setAllowance",
			args: [
				keccak256(toBytes("waifu.agent.max-percent-per-trade")),
				BigInt(autonomy.maxPercentPortfolioPerTrade),
				0n,
				0n,
			],
		}),
		encodeFunctionData({
			abi: ROLES_V2_ABI,
			functionName: "setAllowance",
			args: [
				keccak256(toBytes("waifu.agent.max-trades-per-24h")),
				BigInt(autonomy.maxTradesPer24h),
				BigInt(autonomy.maxTradesPer24h),
				BigInt(24 * 60 * 60),
			],
		}),
	];
}

function encodeTokenAllowlistConditions(tokenAllowlist: readonly string[]): Hex {
	const addresses = tokenAllowlist.filter(isEvmAddress).map((address) => getAddress(address));
	if (addresses.length === 0) return "0x";
	return concatHex(addresses as Hex[]);
}

function assertAutonomy(autonomy: AgentAutonomyConfig): void {
	if (autonomy.maxPercentPortfolioPerTrade <= 0 || autonomy.maxPercentPortfolioPerTrade > 100) {
		throw new Error("maxPercentPortfolioPerTrade must be between 1 and 100");
	}
	if (!Number.isInteger(autonomy.maxTradesPer24h) || autonomy.maxTradesPer24h <= 0) {
		throw new Error("maxTradesPer24h must be a positive integer");
	}
}

function isEvmAddress(value: string): value is Address {
	return /^0x[a-fA-F0-9]{40}$/.test(value);
}
