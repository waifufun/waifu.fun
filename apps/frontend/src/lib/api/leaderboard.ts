import { useQuery } from "@tanstack/react-query";

/**
 * Public leaderboard entry — the "who's winning the alive game" view.
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
	id?: string;
	address?: string;
	name?: string;
	ticker?: string;
	symbol?: string;
	avatar?: string | null;
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

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "include",
	});
	if (!res.ok) {
		throw new Error(`Request failed ${res.status}: ${path}`);
	}
	return (await res.json()) as T;
}

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

function computeDaysAlive(raw: RawAgent): number {
	if (typeof raw.daysAlive === "number") return Math.max(0, Math.floor(raw.daysAlive));
	if (typeof raw.days_alive === "number") return Math.max(0, Math.floor(raw.days_alive));
	const iso = raw.launchedAt ?? raw.launched_at ?? raw.createdAt;
	if (!iso) return 0;
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return 0;
	const diff = Date.now() - t;
	return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
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
	return {
		id: String(raw.id ?? raw.address ?? ""),
		name: raw.name ?? "Unnamed",
		ticker: raw.ticker ?? raw.symbol ?? "",
		avatar: raw.avatar ?? raw.image ?? null,
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
 * Hook for the public leaderboard. Prefers the dedicated endpoint; if that's
 * not live, falls back to `/v2/agents` and computes runway client-side.
 */
export function useLeaderboard(sort: LeaderboardSort = "runway", limit = 50) {
	return useQuery<LeaderboardEntry[]>({
		queryKey: ["leaderboard", sort, limit],
		queryFn: async () => {
			try {
				const data = await getJson<unknown>(`/v2/agents/leaderboard?sort=${encodeURIComponent(sort)}&limit=${limit}`);
				const entries = pickArray(data).map(normalizeEntry);
				if (entries.length > 0) return sortEntries(entries, sort);
			} catch {
				// fall through to the generic agents endpoint
			}

			try {
				const data = await getJson<unknown>(`/v2/agents?limit=${limit}`);
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

export function formatRunway(days: number): string {
	if (!Number.isFinite(days)) return "∞";
	if (days <= 0) return "0 days";
	if (days < 1) {
		const hours = Math.max(1, Math.round(days * 24));
		return `${hours}h`;
	}
	const rounded = Math.round(days);
	return `${rounded.toLocaleString("en-US")} day${rounded === 1 ? "" : "s"}`;
}

export function formatUsdExact(value: number | undefined | null): string {
	if (value == null || Number.isNaN(value)) return "$0";
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}
