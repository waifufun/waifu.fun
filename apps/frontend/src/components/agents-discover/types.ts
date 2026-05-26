import type { AgentData } from "@/components/agent-home/types";

export type AgentStatusFilter = "all" | "active" | "graduated";
export type AgentSort = "newest" | "volume_24h" | "market_cap";

export interface AgentListItem extends Partial<AgentData> {
	tokenAddress: string;
	name: string;
	ticker: string;
	status: "active" | "graduated" | "pending";
	image?: string;
	description?: string;
	createdAt?: number;
	volume24h?: number;
	marketCap?: number;
	chain?: string;
	chainId?: number;
	launchPlatform?: string;
	// runtime metadata (from AgentData, surfaced on cards)
	eip8004TokenId?: string | number;
	framework?: string;
	model?: string;
	lastActionAt?: number;
	lastActionType?: string;
}

export interface AgentListResponse {
	agents: AgentListItem[];
	total: number;
	stats?: {
		totalAgents?: number;
		totalVolume?: number;
		graduatedCount?: number;
	};
}
