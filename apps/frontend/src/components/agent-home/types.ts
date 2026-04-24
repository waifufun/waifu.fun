export interface AgentData {
	tokenAddress: string;
	walletAddress?: string;
	treasuryAddress?: string;
	name: string;
	ticker: string;
	image?: string;
	description?: string;
	status: "active" | "graduated" | "pending";
	preset?: string;
	traits?: string[];
	systemPrompt?: string;
	twitterHandle?: string;
	curveProgress?: number;
	curveLimit?: number;
	waifuBonded?: number;
	raisedToken?: string;
	pancakeSwapUrl?: string;
	fourMemeUrl?: string;
	// runtime metadata
	eip8004TokenId?: string | number;
	framework?: string; // agent runtime label, if the backend attaches one
	model?: string; // inference model label, if the backend attaches one
	lastActionAt?: number; // unix ms of last autonomous output (trade, call, post, etc)
	lastActionType?: "trade" | "call" | "post" | "ship" | "decide" | string;
}

export interface AgentTrade {
	txId: string;
	type: "buy" | "sell";
	address: string;
	amount: string | number;
	timestamp: number;
}

/**
 * AgentEvent mirrors the backend event feed (W1.7). Until the shared types
 * package ships a single source of truth we duplicate here; see README.md in
 * this directory for the graceful-degrade contract.
 */
export interface AgentEvent {
	id: string;
	agentId: string;
	eventType: string; // e.g. "token.purchased", "tax.received", "x.posted"
	data: Record<string, unknown>;
	txHash?: string;
	createdAt: number; // unix ms
}

export interface AgentEventPage {
	events: AgentEvent[];
	nextCursor: string | null;
}
