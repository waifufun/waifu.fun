/**
 * Fetcher for the agent's OWN trade history — swaps initiated by the
 * agent's wallets (agent-safe / agent-hot), not user activity on the
 * agent's token. Backed by `/v2/agents/:address/activity-trades`.
 *
 * Trade amounts come back as raw 18-decimal wei strings; we normalize
 * them to human token units here so downstream UI surfaces never have
 * to think about decimals.
 */
import type { AgentTrade } from "@/components/agent-home/types";

import { normalizeTokenAmount } from "./normalize-amount";

function serverAgentApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

const API_BASE = serverAgentApiBase();

/** Legacy BSC-swap shape returned for spot agents. */
type BscActivityTradeResponse = {
	txHash: string;
	trader: string;
	traderRole: "agent-safe" | "agent-hot";
	tokenAddress: string;
	tokenSymbol?: string;
	side: "buy" | "sell";
	amountIn: string;
	amountOut: string;
	usdValue?: number;
	blockTimestamp: string;
};

/** Hyperliquid perp-fill shape returned for venue traders. */
type HlActivityTradeResponse = {
	id: string;
	venue: string;
	orderId?: string;
	asset: string;
	side: "buy" | "sell";
	size: string;
	price: string;
	notionalUsd?: string;
	feeUsd?: string;
	closedPnlUsd?: string;
	timestamp: string;
	isPositionOpen?: boolean;
};

function isHlTrade(raw: Record<string, unknown>): raw is HlActivityTradeResponse {
	// HL fills carry an `asset` + `size` + `price` and no `txHash`. BSC swaps
	// carry `txHash` + `amountIn`/`amountOut`. Branch on the presence of the
	// HL-only fields so the same endpoint can feed both venues.
	return typeof raw.txHash !== "string" && typeof raw.asset === "string" && typeof raw.size === "string";
}

function mapBscTrade(raw: BscActivityTradeResponse): AgentTrade {
	const timestamp = Date.parse(raw.blockTimestamp);
	const rawAmount = raw.side === "buy" ? raw.amountOut : raw.amountIn;
	const trade: AgentTrade = {
		txId: raw.txHash,
		type: raw.side,
		address: raw.trader,
		amount: normalizeTokenAmount(rawAmount),
		timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
		tokenAddress: raw.tokenAddress,
		traderRole: raw.traderRole,
	};
	if (raw.tokenSymbol) trade.tokenSymbol = raw.tokenSymbol;
	if (raw.usdValue !== undefined) trade.usdValue = raw.usdValue;
	return trade;
}

function mapHlTrade(raw: HlActivityTradeResponse): AgentTrade {
	const timestamp = Date.parse(raw.timestamp);
	const size = Number.parseFloat(raw.size);
	const usd = raw.notionalUsd !== undefined ? Number.parseFloat(raw.notionalUsd) : undefined;
	const trade: AgentTrade = {
		txId: raw.id,
		type: raw.side === "sell" ? "sell" : "buy",
		address: "",
		amount: Number.isFinite(size) ? size : 0,
		timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
		tokenSymbol: raw.asset.toUpperCase(),
		// HL fills are perp fills, not BSC swaps. Tag the venue so the
		// activity feed renders the hyperliquid mark and skips the bscscan
		// tx-link path (raw.id is a fill id, not an on-chain tx hash).
		venue: "hyperliquid",
	};
	if (usd !== undefined && Number.isFinite(usd)) trade.usdValue = usd;
	return trade;
}

/**
 * Normalize a single raw /activity-trades record (BSC swap or HL fill)
 * into an AgentTrade. Exported so the client-side live poll can share
 * the exact same HL normalization instead of reimplementing it.
 */
export function mapAgentOwnTrade(raw: Record<string, unknown>): AgentTrade {
	if (isHlTrade(raw)) return mapHlTrade(raw);
	return mapBscTrade(raw as unknown as BscActivityTradeResponse);
}

/**
 * Unwrap the /activity-trades response into a raw record array. The
 * endpoint returns either a bare array (BSC spot) or `{ trades: [...] }`
 * (hyperliquid). Both server fetch and client poll funnel through this
 * so the envelope handling never drifts between the two.
 */
export function unwrapActivityTrades(data: unknown): Record<string, unknown>[] {
	const raw = Array.isArray(data)
		? data
		: data && typeof data === "object" && Array.isArray((data as { trades?: unknown }).trades)
			? (data as { trades: unknown[] }).trades
			: [];
	return raw.slice(0, 20).map((trade) => trade as Record<string, unknown>);
}

/**
 * Fetch the agent's own swap history.
 *
 * Returns an empty array on any error so the activity feed never throws
 * from a missing endpoint.
 */
export async function fetchAgentOwnTrades(address: string): Promise<AgentTrade[]> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}/activity-trades`, {
			next: { revalidate: 15 },
		});
		if (!res.ok) return [];
		const data = (await res.json()) as unknown;
		// The endpoint returns either a bare array (BSC) or `{ trades: [...] }`
		// (hyperliquid). Normalize both into one trade list.
		return unwrapActivityTrades(data).map((trade) => mapAgentOwnTrade(trade));
	} catch (e) {
		console.error("agent own-trades fetch failed", e);
		return [];
	}
}

/** @deprecated Import `fetchAgentOwnTrades` instead. Kept for one cycle. */
export const fetchSolTrades = fetchAgentOwnTrades;
