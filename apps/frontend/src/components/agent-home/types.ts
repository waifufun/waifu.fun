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
}

export interface AgentTrade {
	txId: string;
	type: "buy" | "sell";
	address: string;
	amount: string | number;
	timestamp: number;
}
