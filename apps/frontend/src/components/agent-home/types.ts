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
	framework?: string; // e.g. "ElizaOS"
	model?: string; // e.g. "Cloud"
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
