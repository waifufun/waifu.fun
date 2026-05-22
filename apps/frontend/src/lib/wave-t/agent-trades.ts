import type { AgentTrade } from "@/components/agent-home/types";

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

function mapSolTrade(raw: AgentActivityTradeResponse): AgentTrade {
	const timestamp = Date.parse(raw.blockTimestamp);
	const trade: AgentTrade = {
		txId: raw.txHash,
		type: raw.side,
		address: raw.trader,
		amount: raw.side === "buy" ? raw.amountOut : raw.amountIn,
		timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
		tokenAddress: raw.tokenAddress,
		traderRole: raw.traderRole,
	};
	if (raw.tokenSymbol) trade.tokenSymbol = raw.tokenSymbol;
	if (raw.usdValue !== undefined) trade.usdValue = raw.usdValue;
	return trade;
}

export async function fetchSolTrades(address: string): Promise<AgentTrade[]> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/${address}/activity-trades`, {
			next: { revalidate: 15 },
		});
		if (!res.ok) return [];
		const data = (await res.json()) as unknown;
		const trades = Array.isArray(data) ? data : [];
		return trades.slice(0, 20).map((trade) => mapSolTrade(trade as AgentActivityTradeResponse));
	} catch (e) {
		console.error("sol trades fetch failed", e);
		return [];
	}
}
