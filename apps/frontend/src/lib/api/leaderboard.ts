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
	treasuryUsd: number | null;
	dailyBurnUsd: number | null;
	runwayDays: number | null;
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
	treasuryUsd?: number | null;
	treasury_usd?: number | null;
	// `/v2/agents` seeds treasury from the NAV snapshot under this field; the
	// API also fills `treasuryUsd` directly for graduated agents (waifufun#744).
	treasuryNavUsd?: number | null;
	treasury_nav_usd?: number | null;
	agentSafeAddress?: string | null;
	dailyBurnUsd?: number | null;
	daily_burn_usd?: number | null;
	runwayDays?: number | null;
	runway_days?: number | null;
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

function finiteNumberOrNull(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function computeRunway(treasuryUsd: number | null, dailyBurnUsd: number | null, given?: number | null): number | null {
	if (typeof given === "number" && Number.isFinite(given)) return given;
	if (dailyBurnUsd === null || dailyBurnUsd <= 0) return Number.POSITIVE_INFINITY;
	if (treasuryUsd === null || treasuryUsd <= 0) return 0;
	return treasuryUsd / dailyBurnUsd;
}

export function normalizeEntry(raw: RawAgent): LeaderboardEntry {
	const treasuryUsd =
		finiteNumberOrNull(raw.treasuryUsd) ??
		finiteNumberOrNull(raw.treasury_usd) ??
		finiteNumberOrNull(raw.treasuryNavUsd) ??
		finiteNumberOrNull(raw.treasury_nav_usd);
	const dailyBurnUsd = finiteNumberOrNull(raw.dailyBurnUsd) ?? finiteNumberOrNull(raw.daily_burn_usd);
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
		const aTreasury = a.treasuryUsd ?? 0;
		const bTreasury = b.treasuryUsd ?? 0;
		const aBurn = a.dailyBurnUsd ?? 0;
		const bBurn = b.dailyBurnUsd ?? 0;
		if (sort === "treasury") return bTreasury - aTreasury;
		if (sort === "burn") return bBurn - aBurn;
		// runway: push infinity to the top (still alive forever), ties broken by treasury
		const aInf = a.runwayDays !== null && !Number.isFinite(a.runwayDays);
		const bInf = b.runwayDays !== null && !Number.isFinite(b.runwayDays);
		if (aInf && !bInf) return -1;
		if (!aInf && bInf) return 1;
		if (aInf && bInf) return bTreasury - aTreasury;
		return (b.runwayDays ?? 0) - (a.runwayDays ?? 0);
	});
	return copy;
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
 * Treasury comes from the batched `/v2/agents` summary response. Do not add
 * per-row holdings calls here, issue #744 moved that enrichment server-side.
 */
export function useLeaderboard(sort: LeaderboardSort = "runway", limit = 50) {
	return useQuery<LeaderboardEntry[]>({
		queryKey: ["leaderboard", sort, limit],
		queryFn: async () => {
			try {
				const data = await apiFetch<unknown>(`/v2/agents?limit=${limit}`);
				const entries = pickArray(data).map(normalizeEntry);
				return sortEntries(entries, sort);
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

export function formatRunway(days: number | null | undefined): string {
	// Non-finite happens when dailyBurnUsd is 0 (no agent activity yet). The
	// leaderboard surfaces "no burn" as honest copy in wave-t grammar rather
	// than rendering an en-dash glyph. Once burn data lands the cell switches
	// to real day counts automatically.
	if (days == null || !Number.isFinite(days)) return "no burn";
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
