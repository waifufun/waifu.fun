import type { AgentData } from "@/components/agent-home/types";
import type {
	AgentListItem,
	AgentListResponse,
	AgentSort,
	AgentStatusFilter,
} from "@/components/agents-discover/types";

/** Server-side fetch requires an absolute URL; client can use a relative `/api` BFF path. */
function getApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL;
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/$/, "");
	}
	const pathBase = configured?.replace(/\/$/, "") || "/api";
	if (typeof window !== "undefined") {
		return pathBase;
	}
	const origin = (process.env.NEXT_PUBLIC_HOST || "https://www.waifu.fun").replace(/\/$/, "");
	return `${origin}${pathBase.startsWith("/") ? pathBase : `/${pathBase}`}`;
}

/**
 * Backend returns { agentId, name, symbol, avatarUrl, ... } (see
 * packages/db/src/queries/agents.ts `AgentSummary`). Frontend consumes
 * { tokenAddress, name, ticker, image, ... } (see AgentListItem).
 * Normalize once at the boundary so no component needs to know about both.
 */
function mapAgentSummary(raw: unknown): AgentListItem {
	const r = (raw ?? {}) as Record<string, unknown>;
	const curve = (r.curve ?? null) as null | Record<string, unknown>;
	const identity = (r.identity ?? null) as null | Record<string, unknown>;
	const status = normalizeStatus(r.status);
	const item: AgentListItem = {
		tokenAddress: String(r.tokenAddress ?? r.token_address ?? ""),
		name: String(r.name ?? "unknown"),
		ticker: String(r.ticker ?? r.symbol ?? ""),
		status,
	};
	const description = typeof r.description === "string" ? (r.description as string) : undefined;
	if (description) item.description = description;
	const avatar =
		typeof r.image === "string"
			? (r.image as string)
			: typeof r.avatarUrl === "string"
				? (r.avatarUrl as string)
				: undefined;
	if (avatar) item.image = avatar;
	const walletAddress = typeof r.walletAddress === "string" ? (r.walletAddress as string) : undefined;
	if (walletAddress) item.walletAddress = walletAddress;
	const treasuryAddress = typeof r.treasuryAddress === "string" ? (r.treasuryAddress as string) : undefined;
	if (treasuryAddress) item.treasuryAddress = treasuryAddress;
	const preset = typeof r.preset === "string" ? (r.preset as string) : undefined;
	if (preset) item.preset = preset;
	const twitterHandle = typeof r.twitterHandle === "string" ? (r.twitterHandle as string) : undefined;
	if (twitterHandle) item.twitterHandle = twitterHandle;

	if (identity) {
		const tokenId = identity.eip8004TokenId;
		if (typeof tokenId === "string" || typeof tokenId === "number") {
			item.eip8004TokenId = tokenId;
		}
	}
	const framework = typeof r.framework === "string" ? (r.framework as string) : undefined;
	if (framework) item.framework = framework;
	const model = typeof r.model === "string" ? (r.model as string) : undefined;
	if (model) item.model = model;
	const lastActionRaw = r.lastActionAt;
	if (lastActionRaw) {
		const t = typeof lastActionRaw === "string" ? Date.parse(lastActionRaw) : Number(lastActionRaw);
		if (Number.isFinite(t)) item.lastActionAt = t;
	}
	const lastActionType = typeof r.lastActionType === "string" ? (r.lastActionType as string) : undefined;
	if (lastActionType) item.lastActionType = lastActionType;

	const marketCap = readNumber(r.marketCap ?? r.marketCapUsd ?? r.market_cap_usd);
	if (marketCap !== undefined) item.marketCap = marketCap;
	const volume24h = readNumber(r.volume24h ?? r.volume24hUsd ?? r.volume_24h);
	if (volume24h !== undefined) item.volume24h = volume24h;
	const priceChange24h = readNumber(r.priceChange24h ?? r.priceChange24hPct ?? r.price_change_24h);
	if (priceChange24h !== undefined) item.priceChange24h = priceChange24h;
	const holders = readNumber(r.holders ?? r.holderCount ?? r.holder_count);
	if (holders !== undefined) item.holders = holders;
	const treasuryUsd = readNumber(r.treasuryUsd ?? r.treasuryNavUsd ?? r.navUsd ?? r.treasury_usd);
	if (treasuryUsd !== undefined) item.treasuryUsd = treasuryUsd;

	if (curve) {
		const bondedRaw = curve.waifuBonded;
		const limitRaw = curve.curveLimit;
		if (typeof bondedRaw === "string" || typeof bondedRaw === "number") {
			item.waifuBonded = Number(bondedRaw);
		}
		if (typeof limitRaw === "string" || typeof limitRaw === "number") {
			item.curveLimit = Number(limitRaw);
			if (item.waifuBonded !== undefined && item.curveLimit > 0) {
				item.curveProgress = Math.min(100, (item.waifuBonded / item.curveLimit) * 100);
			}
		}
	}

	const createdRaw = r.createdAt;
	if (createdRaw) {
		const t = typeof createdRaw === "string" ? Date.parse(createdRaw) : Number(createdRaw);
		if (Number.isFinite(t)) item.createdAt = t;
	}

	return item;
}

function readNumber(value: unknown): number | undefined {
	if (typeof value !== "number" && typeof value !== "string") return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeStatus(s: unknown): "active" | "graduated" | "pending" {
	if (s === "graduated") return "graduated";
	if (s === "pending" || s === "failed") return "pending";
	return "active";
}

export interface FetchAgentsParams {
	limit?: number;
	offset?: number;
	status?: AgentStatusFilter;
	sort?: AgentSort;
	/**
	 * Include legacy v1 agents (e.g. $DEMO from the four.meme hackathon)
	 * in the listing. Defaults to false so the v1 hackathon demo does not
	 * appear on the launch-era landing or agents pages. Set explicitly to
	 * true only on archive surfaces that want to show historical agents.
	 */
	includeLegacy?: boolean;
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
	const includeLegacy = params.includeLegacy ?? false;

	const qs = new URLSearchParams({
		limit: String(limit),
		offset: String(offset),
		sort,
	});
	if (status !== "all") qs.set("status", status);
	if (includeLegacy) qs.set("includeLegacy", "true");

	try {
		const res = await fetch(`${getApiBase()}/v2/agents?${qs.toString()}`, {
			next: { revalidate: 10 },
		});
		if (!res.ok) {
			throw new Error(`agents fetch failed (${res.status})`);
		}
		const data = await res.json();

		// v2 shape: { agents: [...], total, stats }
		if (Array.isArray(data.agents)) {
			return {
				agents: data.agents.map(mapAgentSummary),
				total: Number(data.total ?? data.agents.length),
				stats: data.stats,
			};
		}
		// alt shape: { docs: [...], total }
		if (Array.isArray(data.docs)) {
			return {
				agents: data.docs.map(mapAgentSummary),
				total: Number(data.total ?? data.docs.length),
				stats: data.stats,
			};
		}
		// direct array
		if (Array.isArray(data)) {
			return {
				agents: data.map(mapAgentSummary),
				total: (data as unknown[]).length,
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
		const res = await fetch(`${getApiBase()}/tokens`, {
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
		const res = await fetch(`${getApiBase()}/v2/agents/stats`, {
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
		const res = await fetch(`${getApiBase()}/v2/agents/trades?limit=${limit}`, { next: { revalidate: 5 } });
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
		const res = await fetch(`${getApiBase()}/v2/agents/${first.tokenAddress}/trades`, { next: { revalidate: 5 } });
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
