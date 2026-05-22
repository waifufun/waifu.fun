import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./_fetcher";

/**
 * Public leaderboard entry: the "who's winning the alive game" view.
 *
 * Mirrors `GET /v2/agents/leaderboard` when the endpoint is live. Until
 * then we fall back to `GET /v2/agents` and compute runway client-side.
 */
export type LeaderboardStatus = "active" | "dormant" | "killed" | "graduated";

export type LeaderboardSort = "runway" | "treasury" | "burn";

export type LeaderboardEntry = {
	id: string;
	name: string;
	ticker: string;
	avatar?: string | null;
	treasuryUsd: number;
	dailyBurnUsd: number;
	runwayDays: number;
	status: LeaderboardStatus;
	daysAlive: number;
};

type RawAgent = {
	// Identity: the public /v2/agents response uses `agentId` (string slug) +
	// `tokenAddress` (BSC address). Older internal helpers used `id`/`address`.
	// Accept all four so client-side renorm doesn't depend on which surface
	// shipped first.
	id?: string;
	agentId?: string;
	address?: string;
	tokenAddress?: string;
	name?: string;
	ticker?: string;
	symbol?: string;
	// Avatar: /v2/agents exposes the already-resolved gateway URL as
	// `avatarUrl`. Older shapes used `avatar` / `image` (sometimes a bare
	// CID). `resolveImageUrl` at the render site handles either.
	avatar?: string | null;
	avatarUrl?: string | null;
	image?: string | null;
	treasuryUsd?: number;
	treasury_usd?: number;
	dailyBurnUsd?: number;
	daily_burn_usd?: number;
	runwayDays?: number;
	runway_days?: number;
	status?: string;
	daysAlive?: number;
	days_alive?: number;
	launchedAt?: string;
	launched_at?: string;
	createdAt?: string;
};

function pickArray(data: unknown): RawAgent[] {
	if (Array.isArray(data)) return data as RawAgent[];
	if (data && typeof data === "object") {
		const obj = data as { agents?: unknown; entries?: unknown; items?: unknown };
		if (Array.isArray(obj.agents)) return obj.agents as RawAgent[];
		if (Array.isArray(obj.entries)) return obj.entries as RawAgent[];
		if (Array.isArray(obj.items)) return obj.items as RawAgent[];
	}
	return [];
}

function toStatus(raw?: string): LeaderboardStatus {
	if (raw === "active" || raw === "dormant" || raw === "killed" || raw === "graduated") {
		return raw;
	}
	return "dormant";
}

/**
 * Compute days since launch / creation. We keep the precision (decimal days)
 * so the formatter can render sub-day ages as "today" / "Nh" instead of "0"
 * — every fresh launch hits this case and "0" looks like a bug.
 */
function computeDaysAlive(raw: RawAgent): number {
	if (typeof raw.daysAlive === "number") return Math.max(0, raw.daysAlive);
	if (typeof raw.days_alive === "number") return Math.max(0, raw.days_alive);
	const iso = raw.launchedAt ?? raw.launched_at ?? raw.createdAt;
	if (!iso) return 0;
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return 0;
	const diff = Date.now() - t;
	return Math.max(0, diff / (24 * 60 * 60 * 1000));
}

function computeRunway(treasuryUsd: number, dailyBurnUsd: number, given?: number): number {
	if (typeof given === "number" && Number.isFinite(given)) return given;
	if (!dailyBurnUsd || dailyBurnUsd <= 0) return Number.POSITIVE_INFINITY;
	if (!treasuryUsd || treasuryUsd <= 0) return 0;
	return treasuryUsd / dailyBurnUsd;
}

export function normalizeEntry(raw: RawAgent): LeaderboardEntry {
	const treasuryUsd = Number(raw.treasuryUsd ?? raw.treasury_usd ?? 0) || 0;
	const dailyBurnUsd = Number(raw.dailyBurnUsd ?? raw.daily_burn_usd ?? 0) || 0;
	const runwayDays = computeRunway(treasuryUsd, dailyBurnUsd, raw.runwayDays ?? raw.runway_days);
	// Prefer the token address for the row link since `/agent/[address]` is
	// the canonical agent-detail route. Fall back through legacy fields so
	// the leaderboard still renders against older API shapes.
	const id = String(raw.tokenAddress ?? raw.address ?? raw.agentId ?? raw.id ?? "");
	return {
		id,
		name: raw.name ?? "Unnamed",
		ticker: raw.ticker ?? raw.symbol ?? "",
		avatar: raw.avatarUrl ?? raw.avatar ?? raw.image ?? null,
		treasuryUsd,
		dailyBurnUsd,
		runwayDays,
		status: toStatus(raw.status),
		daysAlive: computeDaysAlive(raw),
	};
}

function sortEntries(entries: LeaderboardEntry[], sort: LeaderboardSort): LeaderboardEntry[] {
	const copy = [...entries];
	copy.sort((a, b) => {
		if (sort === "treasury") return b.treasuryUsd - a.treasuryUsd;
		if (sort === "burn") return b.dailyBurnUsd - a.dailyBurnUsd;
		// runway: push infinity to the top (still alive forever), ties broken by treasury
		const aInf = !Number.isFinite(a.runwayDays);
		const bInf = !Number.isFinite(b.runwayDays);
		if (aInf && !bInf) return -1;
		if (!aInf && bInf) return 1;
		if (aInf && bInf) return b.treasuryUsd - a.treasuryUsd;
		return b.runwayDays - a.runwayDays;
	});
	return copy;
}

/**
 * Per-agent holdings snapshot from the NAV aggregator. Only the rolled-up
 * `navUsd` is needed for the leaderboard treasury column; the rest of the
 * payload is ignored here.
 *
 * Endpoint: `GET /v2/agents/:tokenAddress/holdings` (introduced in #712).
 * Returns 404 for agents without an aggregated holdings record — the
 * leaderboard treats that as null and the table renders `–`.
 */
type HoldingsSnapshotResponse = { ok: true; data: { navUsd: number } } | { navUsd: number };

async function fetchAgentNavUsd(tokenAddress: string): Promise<number | null> {
	try {
		const raw = await apiFetch<HoldingsSnapshotResponse>(`/v2/agents/${encodeURIComponent(tokenAddress)}/holdings`);
		const inner = raw && typeof raw === "object" && "ok" in raw && "data" in raw ? raw.data : raw;
		const navUsd = typeof inner?.navUsd === "number" ? inner.navUsd : null;
		return Number.isFinite(navUsd) ? navUsd : null;
	} catch {
		return null;
	}
}

/**
 * Hook for the public leaderboard.
 *
 * The dedicated `/v2/agents/leaderboard` endpoint is not yet implemented on
 * the API. Calling it falls through to the `/v2/agents/:tokenAddress` catch-all
 * which 400s with `invalid token address`, polluting the browser console on
 * every home/leaderboard render. Skip the call entirely until the route ships
 * and just compute the ranking client-side from `/v2/agents`.
 *
 * For treasury we hit `/v2/agents/:address/holdings` per-agent in parallel.
 * That's the same NAV aggregator the agent-detail page renders against, so
 * the dollar figure on the leaderboard always matches the agent page
 * exactly. N+1 by row, but parallelized and react-query cached — for the
 * current ~handful of agents that's fine. If the list grows past ~50 the
 * right move is a batch endpoint server-side, tracked in waifufun#744.
 */
export function useLeaderboard(sort: LeaderboardSort = "runway", limit = 50) {
	return useQuery<LeaderboardEntry[]>({
		queryKey: ["leaderboard", sort, limit],
		queryFn: async () => {
			try {
				const data = await apiFetch<unknown>(`/v2/agents?limit=${limit}`);
				const entries = pickArray(data).map(normalizeEntry);
				const enriched = await Promise.all(
					entries.map(async (entry) => {
						if (entry.treasuryUsd > 0 || !entry.id) return entry;
						const navUsd = await fetchAgentNavUsd(entry.id);
						if (navUsd === null) return entry;
						const runwayDays = computeRunway(navUsd, entry.dailyBurnUsd, undefined);
						return { ...entry, treasuryUsd: navUsd, runwayDays };
					}),
				);
				return sortEntries(enriched, sort);
			} catch {
				return [];
			}
		},
		refetchInterval: 60_000,
		retry: 1,
	});
}

/**
 * Days-alive cell formatter. Renders sub-day ages as "just now" / "Nh"
 * because the leaderboard otherwise shows a giant "0d" for every fresh
 * launch — every agent hits this on launch day and the 0 reads as
 * "this is broken" rather than "this is brand new".
 */
export function formatDaysAlive(days: number): string {
	if (!Number.isFinite(days) || days < 0) return "–";
	if (days < 1 / 24) return "just now";
	if (days < 1) {
		const hours = Math.max(1, Math.floor(days * 24));
		return `${hours}h`;
	}
	const rounded = Math.floor(days);
	return `${rounded}d`;
}

export function formatRunway(days: number): string {
	// Non-finite happens when dailyBurnUsd is 0 (no agent activity yet). The
	// leaderboard surfaces "no burn" as honest copy in wave-t grammar rather
	// than rendering an en-dash glyph. Once burn data lands the cell switches
	// to real day counts automatically.
	if (!Number.isFinite(days)) return "no burn";
	if (days <= 0) return "0d";
	if (days < 1) {
		const hours = Math.max(1, Math.round(days * 24));
		return `${hours}h`;
	}
	const rounded = Math.round(days);
	if (rounded >= 1000) return `${(rounded / 1000).toFixed(1)}k d`;
	return `${rounded}d`;
}

export function formatUsdExact(value: number | undefined | null): string {
	if (value == null || Number.isNaN(value)) return "$0";
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/**
 * Compact USD for dense table cells. `$1.28M`, `$847k`, `$42`.
 *
 * Wave T grammar: numbers are always mono + tabular, copy is lowercase.
 * Full precision belongs in tooltips, not in row cells. Returns `$0` for
 * null/NaN; callers that want to render "no data yet" should branch on
 * the source value, not on the formatted string.
 */
export function formatUsdCompact(value: number | undefined | null): string {
	if (value == null || Number.isNaN(value)) return "$0";
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
	if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
	if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
	if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}k`;
	return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}
