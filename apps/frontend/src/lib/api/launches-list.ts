/**
 * GET /v2/launches — list active and recent launches with filters.
 *
 * Returns a normalized list shape that powers the `/launches` index page
 * and the live-launches rail on the landing page. Falls back to an empty
 * list when the endpoint isn't deployed (404), so the UI shows the empty
 * state instead of a hard error.
 *
 * Backend handler: apps/api/src/routes/v2/agent-launches.ts (line 233+).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch, isApiError } from "./_fetcher";

export type LaunchListState = "open" | "closed" | "launched" | "failed";
export type LaunchListTier = 80 | 90 | 95 | 98;

export type LaunchListItem = {
	id: string;
	token: string;
	vault: string;
	creator: string;
	tier: string; // "80" | "90" | "95" | "98"
	state: LaunchListState | string;
	totalDeposited: string; // wei
	bonusPool?: string;
	depositorCount?: number;
	capacity?: string; // wei
	v2BuyBnb?: string; // wei
	vestingEnabled?: boolean;
	closeTimestamp?: number | null;
	launchTimestamp?: number | null;
	v2Pair?: string | null;
	openMcBnb?: string | null;
	metadata?: {
		name?: string;
		symbol?: string;
		image?: string;
		description?: string;
	} & Record<string, unknown>;
	createdAt?: string;
	updatedAt?: string;
};

export type LaunchListResponse = {
	launches: LaunchListItem[];
	total: number;
	limit: number;
	offset: number;
};

export type FetchLaunchesParams = {
	state?: LaunchListState;
	tier?: LaunchListTier;
	creator?: string;
	limit?: number;
	offset?: number;
};

const EMPTY: LaunchListResponse = { launches: [], total: 0, limit: 0, offset: 0 };

export async function fetchLaunches(
	params: FetchLaunchesParams = {},
	signal?: AbortSignal,
): Promise<LaunchListResponse> {
	const qs = new URLSearchParams();
	if (params.state) qs.set("state", params.state);
	if (params.tier) qs.set("tier", String(params.tier));
	if (params.creator) qs.set("creator", params.creator);
	if (params.limit !== undefined) qs.set("limit", String(params.limit));
	if (params.offset !== undefined) qs.set("offset", String(params.offset));

	try {
		const init: RequestInit = {};
		if (signal) init.signal = signal;
		// API wraps responses as { ok: true, data: T, requestId }, so unwrap here.
		const envelope = await apiFetch<{ ok: true; data: LaunchListResponse }>(`/v2/launches?${qs.toString()}`, init);
		const data = envelope?.data;
		if (Array.isArray(data?.launches)) {
			return {
				launches: data.launches,
				total: Number(data.total ?? data.launches.length),
				limit: Number(data.limit ?? params.limit ?? 20),
				offset: Number(data.offset ?? params.offset ?? 0),
			};
		}
		return EMPTY;
	} catch (err) {
		if (isApiError(err) && (err.status === 404 || err.status === 501)) return EMPTY;
		throw err;
	}
}

export const launchesListQueryKey = (params: FetchLaunchesParams) => ["launches-list", params] as const;

export function useLaunchesList(params: FetchLaunchesParams = {}, opts: { enabled?: boolean } = {}) {
	return useQuery<LaunchListResponse>({
		queryKey: launchesListQueryKey(params),
		queryFn: ({ signal }) => fetchLaunches(params, signal),
		enabled: opts.enabled ?? true,
		staleTime: 10_000,
	});
}

/* ------- presentational helpers ------- */

export function getLaunchName(item: LaunchListItem): string {
	const fromMeta = typeof item.metadata?.name === "string" ? item.metadata.name : null;
	if (fromMeta) return fromMeta;
	return `launch ${item.id.slice(0, 8)}`;
}

export function getLaunchSymbol(item: LaunchListItem): string {
	const fromMeta = typeof item.metadata?.symbol === "string" ? item.metadata.symbol : null;
	if (fromMeta) return fromMeta;
	return item.token.slice(2, 6).toUpperCase();
}

export function getLaunchImage(item: LaunchListItem): string | null {
	const fromMeta = typeof item.metadata?.image === "string" ? item.metadata.image : null;
	return fromMeta;
}

export function getLaunchTierNumber(item: LaunchListItem): LaunchListTier | null {
	const n = Number(item.tier);
	if (n === 80 || n === 90 || n === 95 || n === 98) return n;
	return null;
}

export function safeBigInt(value: string | undefined | null): bigint {
	if (!value) return 0n;
	try {
		return BigInt(value);
	} catch {
		return 0n;
	}
}

export function progressPct(deposited: bigint, capacity: bigint): number {
	if (capacity === 0n) return 0;
	const bps = Number((deposited * 10_000n) / capacity);
	return Math.min(100, Math.max(0, bps / 100));
}
