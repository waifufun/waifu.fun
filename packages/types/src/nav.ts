export type AgentWalletRole = "agent-safe" | "agent-hot" | "patron" | "venue-bridge";
export type HoldingKind = "spot" | "perp" | "lp" | "lend" | "borrow" | "prediction";

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
	kind?: HoldingKind;
	venue?: string;
	side?: "long" | "short";
	leverage?: number;
	entryPriceUsd?: number;
	unrealizedPnlUsd?: number;
	liquidationPriceUsd?: number | null;
	tokenId?: string;
	metadata?: Record<string, unknown>;
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
