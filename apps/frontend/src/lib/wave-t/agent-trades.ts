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

type AgentActivityTradeResponse = {
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

function mapAgentOwnTrade(raw: AgentActivityTradeResponse): AgentTrade {
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
		const trades = Array.isArray(data) ? data : [];
		return trades.slice(0, 20).map((trade) => mapAgentOwnTrade(trade as AgentActivityTradeResponse));
	} catch (e) {
		console.error("agent own-trades fetch failed", e);
		return [];
	}
}

/** @deprecated Import `fetchAgentOwnTrades` instead. Kept for one cycle. */
export const fetchSolTrades = fetchAgentOwnTrades;
