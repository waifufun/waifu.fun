import type { AgentData } from "@/components/agent-home/types";
import type {
	AgentListItem,
	AgentListResponse,
	AgentSort,
	AgentStatusFilter,
} from "@/components/agents-discover/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export interface FetchAgentsParams {
	limit?: number;
	offset?: number;
	status?: AgentStatusFilter;
	sort?: AgentSort;
}

/**
 * Fetch paginated list of agents from `/v2/agents`.
 * Falls back gracefully (empty list) if the endpoint is not available.
 */
export async function fetchAgents(params: FetchAgentsParams = {}): Promise<AgentListResponse> {
	const limit = params.limit ?? 24;
	const offset = params.offset ?? 0;
	const status = params.status ?? "all";
	const sort = params.sort ?? "newest";

	const qs = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
		sort,
	});
	if (status !== "all") qs.set("status", status);

	try {
		const res = await fetch(`${API_BASE}/v2/agents?${qs.toString()}`, {
			next: { revalidate: 10 },
		});
		if (!res.ok) {
			throw new Error(`agents fetch failed (${res.status})`);
		}
		const data = await res.json();

		// v2 shape: { agents: [...], total, stats }
		if (Array.isArray(data.agents)) {
			return {
				agents: data.agents as AgentListItem[],
				total: Number(data.total ?? data.agents.length),
				stats: data.stats,
			};
		}
		// alt shape: { docs: [...], total }
		if (Array.isArray(data.docs)) {
			return {
				agents: data.docs as AgentListItem[],
				total: Number(data.total ?? data.docs.length),
				stats: data.stats,
			};
		}
		// direct array
		if (Array.isArray(data)) {
			return {
				agents: data as AgentListItem[],
				total: (data as AgentListItem[]).length,
			};
		}
		return { agents: [], total: 0 };
	} catch (err) {
		console.error("fetchAgents failed, falling back to tokens endpoint", err);
		return fetchAgentsFallback({ limit, offset, status });
	}
}

/**
 * Fallback: hit the legacy `/tokens` endpoint and reshape tokens as agents.
 * This keeps the page functional while v2/agents is being wired.
 */
async function fetchAgentsFallback({
	limit,
	offset,
	status,
}: {
	limit: number;
	offset: number;
	status: AgentStatusFilter;
}): Promise<AgentListResponse> {
	try {
		const page = Math.floor(offset / Math.max(limit, 1)) + 1;
		const body: Record<string, unknown> = {
			chain: "bsc",
			chainId: 56,
			page,
			limit,
			category: "new",
			origin: "auto-fun",
		};
		const res = await fetch(`${API_BASE}/tokens`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			next: { revalidate: 10 },
		});
		if (!res.ok) return { agents: [], total: 0 };
		const data = await res.json();
		const docs: Array<Record<string, unknown>> = Array.isArray(data) ? data : (data.docs ?? []);

		let agents: AgentListItem[] = docs.map((t) => {
			const raw = String(t.status ?? "active");
			const agentStatus: AgentListItem["status"] =
				raw === "migrated" || raw === "locked" ? "graduated" : raw === "pending" ? "pending" : "active";

			const item: AgentListItem = {
				tokenAddress: String(t.contractAddress ?? t.tokenAddress ?? ""),
				name: String(t.name ?? "unnamed"),
				ticker: String(t.ticker ?? t.symbol ?? ""),
				status: agentStatus,
			};
			if (typeof t.image === "string") item.image = t.image;
			if (typeof t.description === "string") item.description = t.description;
			if (typeof t.createdAt === "number") {
				item.createdAt = t.createdAt;
			} else if (typeof t.createdAt === "string") {
				const ms = new Date(t.createdAt).getTime();
				if (Number.isFinite(ms)) item.createdAt = ms;
			}
			if (typeof t.volume24h === "number") {
				item.volume24h = t.volume24h;
			} else if (typeof t.volumeUSD === "number") {
				item.volume24h = t.volumeUSD;
			}
			if (typeof t.marketCap === "number") item.marketCap = t.marketCap;
			return item;
		});

		if (status === "active") {
			agents = agents.filter((a) => a.status === "active");
		} else if (status === "graduated") {
			agents = agents.filter((a) => a.status === "graduated");
		}

		return { agents, total: agents.length };
	} catch (err) {
		console.error("fetchAgentsFallback failed", err);
		return { agents: [], total: 0 };
	}
}

/**
 * Fetch lightweight stats (total agents, total volume, graduated count).
 * Tries the dedicated /v2/agents/stats endpoint first, then falls back to
 * inferring from a single page of agents.
 */
export async function fetchAgentStats(): Promise<{
	totalAgents: number;
	totalVolume: number;
	graduatedCount: number;
}> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/stats`, {
			next: { revalidate: 20 },
		});
		if (res.ok) {
			const data = await res.json();
			return {
				totalAgents: Number(data.totalAgents ?? 0),
				totalVolume: Number(data.totalVolume ?? 0),
				graduatedCount: Number(data.graduatedCount ?? 0),
			};
		}
	} catch (err) {
		// ignore and fall through
	}

	try {
		const { agents, stats } = await fetchAgents({ limit: 100, offset: 0 });
		if (stats) {
			return {
				totalAgents: stats.totalAgents ?? agents.length,
				totalVolume: stats.totalVolume ?? 0,
				graduatedCount: stats.graduatedCount ?? agents.filter((a) => a.status === "graduated").length,
			};
		}
		return {
			totalAgents: agents.length,
			totalVolume: agents.reduce((sum, a) => sum + (a.volume24h ?? 0), 0),
			graduatedCount: agents.filter((a) => a.status === "graduated").length,
		};
	} catch {
		return { totalAgents: 0, totalVolume: 0, graduatedCount: 0 };
	}
}

/**
 * Fetch the most recent trades across any agent (best-effort).
 * Hits /v2/agents/trades if it exists, otherwise grabs trades of the most
 * recent agent as a sample.
 */
export interface LiveTrade {
	agentName: string;
	agentTicker: string;
	tokenAddress: string;
	type: "buy" | "sell";
	amount: string;
	timestamp: number;
}

export async function fetchRecentTrades(limit = 10): Promise<LiveTrade[]> {
	try {
		const res = await fetch(`${API_BASE}/v2/agents/trades?limit=${limit}`, { next: { revalidate: 5 } });
		if (res.ok) {
			const data = await res.json();
			const arr = Array.isArray(data) ? data : (data.trades ?? data.docs ?? []);
			return arr.slice(0, limit) as LiveTrade[];
		}
	} catch {
		// fall through
	}

	// fallback: pick first agent, pull its trades
	try {
		const { agents } = await fetchAgents({ limit: 1, offset: 0 });
		if (!agents.length) return [];
		const first = agents[0];
		if (!first) return [];
		const res = await fetch(`${API_BASE}/v2/agents/${first.tokenAddress}/trades`, { next: { revalidate: 5 } });
		if (!res.ok) return [];
		const data = await res.json();
		const trades = Array.isArray(data) ? data : (data.docs ?? data.trades ?? []);
		return trades.slice(0, limit).map((t: Record<string, unknown>) => ({
			agentName: first.name,
			agentTicker: first.ticker,
			tokenAddress: first.tokenAddress,
			type: (t.type === "sell" ? "sell" : "buy") as "buy" | "sell",
			amount: String(t.amount ?? t.toAmount ?? ""),
			timestamp: typeof t.timestamp === "number" ? (t.timestamp as number) : Date.now(),
		}));
	} catch {
		return [];
	}
}

export type { AgentData };
