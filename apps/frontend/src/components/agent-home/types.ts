/**
 * Burn line item: a single cost the agent pays (e.g. "claude max" $200).
 *
 * Backed by `agent_personas.burn` jsonb in the persona API. Producer side
 * normalizes to this shape; FE renders without identity gating. The
 * `iconKey` is a brand-icon registry key (`anthropic | openai | steward |
 * ...`) resolved by `wave-t/_primitives.tsx`. Unknown keys fall back to a
 * neutral chip so a new line item never breaks render.
 */
export interface BurnLineItem {
	name: string;
	usd: number;
	label?: string;
	iconKey?: string;
}

/**
 * App row attached to an agent. Mirrors `lib/wave-t/apps.ts#App` but kept
 * decoupled here so `AgentData.apps` can be populated from any source
 * (persona endpoint or apps endpoint). The render path treats this as
 * the canonical app shape; an empty array means "no panel".
 */
export interface AgentAppRef {
	name: string;
	slug?: string;
	url?: string;
	logoKey?: string;
	status?: "live" | "paused" | "scheduled";
	revenueUsd?: number | null;
	tagline?: string;
}

/**
 * Featured counter footer: "day N of <suffix>". Generic for any agent
 * who wants a launch-day counter in the footer. Null → footer omits it.
 */
export interface FeaturedCounter {
	startedAt: string; // ISO date or unix timestamp
	label?: string; // e.g. "of being me" (suffix)
	displayName?: string;
}

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
	/** primary trade venue link: FLAP pre-graduation, PCS V3 after */
	tradeUrl?: string;
	// runtime metadata
	eip8004TokenId?: string | number;
	framework?: string; // agent runtime label, if the backend attaches one
	model?: string; // inference model label, if the backend attaches one
	lastActionAt?: number; // unix ms of last autonomous output (trade, call, post, etc)
	lastActionType?: "trade" | "call" | "post" | "ship" | "decide" | string;

	/**
	 * Data-driven persona fields (additive). Render presence-based:
	 * empty / null → panel suppressed; populated → panel renders.
	 * Populated by the persona endpoint once the ingestion backend lands;
	 * meantime the page degrades cleanly to "no panel".
	 */
	apps?: AgentAppRef[] | null;
	burn?: BurnLineItem[] | null;
	monthlyBurnUsd?: number | null;
	featuredCounter?: FeaturedCounter | null;
	bioStyle?: "first-person" | "third-person" | null;
	bioShort?: string | null;
	twitterPollingEnabled?: boolean;
	/** Free-form persona metadata jsonb. Holds things like githubRepos[]. */
	metadata?: Record<string, unknown> | null;
	/** Steward session id; presence enables the Steward trading proxy. */
	stewardAgentId?: string | null;
	/** Multi-chain wallets surfaced by the persona endpoint. */
	hlAddress?: string | null;
	arbAddresses?: string[] | null;
	solanaAddresses?: string[] | null;
	/** Eliza Cloud agent sandbox id; presence enables Eliza Cloud routes. */
	elizaCloudAgentId?: string | null;
	/** Featured-agent flag (used for the first-agent placement). */
	featured?: boolean | null;
	/** Long bio (the canonical description). bioShort overrides at the hero. */
	bio?: string | null;
	/** Market metrics from /v2/agents detail/list. */
	marketCapUsd?: number | null;
	priceChange24hPct?: number | null;
	holderCount?: number | null;
	volume24h?: number | null;
	treasuryNavUsd?: number | null;
	thesis?: unknown;
}

export interface AgentTrade {
	txId: string;
	type: "buy" | "sell";
	address: string;
	amount: string | number;
	timestamp: number;
	tokenAddress?: string;
	tokenSymbol?: string;
	traderRole?: "agent-safe" | "agent-hot";
	usdValue?: number;
	/**
	 * Native BNB moved by this spot swap, as a human BNB float (not wei).
	 * For a buy this is the BNB spent (the WBNB-in leg); for a sell it is
	 * the BNB received (the WBNB-out leg). Undefined for venues that do not
	 * settle in BNB (e.g. hyperliquid perp fills).
	 */
	bnbValue?: number;
	/**
	 * Trade venue. Spot swaps come from pancakeswap (the default when
	 * omitted); perp fills carry "hyperliquid" so the activity feed can
	 * pick the right venue icon and skip the bscscan tx-link path.
	 */
	venue?: "pancakeswap" | "hyperliquid";
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
