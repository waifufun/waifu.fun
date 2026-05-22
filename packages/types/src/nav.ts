export type AgentWalletRole = "agent-safe" | "agent-hot" | "patron" | "venue-bridge";

export type Holding = {
	walletId: string;
	walletAddress: string;
	walletLabel: string;
	walletRole: AgentWalletRole;
	chain: string;
	asset: string;
	contract: string | null;
	balance: number;
	priceUsd: number | null;
	valueUsd: number | null;
	priced: boolean;
};

export type NavSnapshot = {
	agentTokenAddress: string;
	generatedAt: number;
	navUsd: number;
	unpriced: { count: number; assets: string[] };
	byChain: Record<string, number>;
	byWallet: Record<string, number>;
	byRole: Record<string, number>;
	holdings: Holding[];
	stale: { source: string; reason: string }[];
};
