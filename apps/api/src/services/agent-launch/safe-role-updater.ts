import { type Address, type Hex, getAddress } from "viem";
import { type AgentAutonomyConfig, DEFAULT_AGENT_AUTONOMY, buildAgentRoleConfigCalls } from "./safe-config.js";

export interface UnsignedTx {
	to: Address;
	data: Hex;
	value: bigint;
	chainId: number;
}

export interface UpdateAgentAutonomyConfig extends Partial<AgentAutonomyConfig> {
	agentEoaAddress?: Address;
	agentTokenAddress?: Address;
}

export function updateAgentAutonomy(
	safeAddress: Address,
	modifierAddress: Address,
	newConfig: UpdateAgentAutonomyConfig,
): UnsignedTx[] {
	void getAddress(safeAddress);
	const autonomy = mergeAutonomy(newConfig);
	const agentEoaAddress = newConfig.agentEoaAddress ?? safeAddress;
	const calls = buildAgentRoleConfigCalls(autonomy, agentEoaAddress, newConfig.agentTokenAddress);

	return calls.map((data) => ({
		to: getAddress(modifierAddress),
		data,
		value: 0n,
		chainId: 56,
	}));
}

function mergeAutonomy(config: UpdateAgentAutonomyConfig): AgentAutonomyConfig {
	return {
		maxPercentPortfolioPerTrade:
			config.maxPercentPortfolioPerTrade ?? DEFAULT_AGENT_AUTONOMY.maxPercentPortfolioPerTrade,
		maxTradesPer24h: config.maxTradesPer24h ?? DEFAULT_AGENT_AUTONOMY.maxTradesPer24h,
		whitelistedTargets: {
			...DEFAULT_AGENT_AUTONOMY.whitelistedTargets,
			...config.whitelistedTargets,
		},
		whitelistedTokens: {
			...DEFAULT_AGENT_AUTONOMY.whitelistedTokens,
			...config.whitelistedTokens,
		},
	};
}
