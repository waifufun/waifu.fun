export type AgentWalletChain = "bsc" | "eth" | "arb" | "base" | "op" | "polygon" | "solana";
export type AgentWalletRole = "agent-safe" | "agent-hot" | "patron" | "venue-bridge";
export type HoldingKind = "spot" | "perp" | "lp" | "lend" | "borrow" | "prediction";

export type EvmNavChain = Extract<AgentWalletChain, "bsc" | "eth" | "arb" | "base" | "op" | "polygon">;

export type NavStaleSource = { source: string; reason: string };

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
	stale: NavStaleSource[];
};

export type NativeBalance = {
	asset: string;
	balance: number;
	raw: string;
};

export type Erc20Balance = {
	contract: string;
	symbol: string;
	decimals: number;
	balance: number;
	raw: string;
};

export type EnumerationResult<T> = {
	holdings: T[];
	stale: NavStaleSource[];
};

export type TokenPrice = {
	priceUsd: number | null;
	priced: boolean;
	source: "coingecko" | "dexscreener" | "pcs-v3-twap" | "native" | "jupiter" | "unpriced";
};
