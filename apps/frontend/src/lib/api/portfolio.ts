/**
 * W51 patron dashboard API client.
 *
 * Fetches every launch the patron's wallet has touched (deposits,
 * withdrawals, claims) plus the on-chain claimable view.
 *
 * Backend endpoint: `GET /v2/users/:address/launches`
 *
 *   {
 *     launches: Array<{
 *       launch: SerializedAgentLaunch,
 *       position: PositionAggregate,
 *     }>,
 *     count: number,
 *   }
 *
 * The page degrades gracefully when the endpoint is not yet deployed
 * (404) or when the launch service can't reach BSC RPC (claimable=null,
 * page falls back to wagmi multicalls).
 */
import { useQuery } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

export type LaunchState = "open" | "closed" | "launched" | "failed";

export type SerializedAgentLaunch = {
	id: string;
	token: string;
	vault: string;
	router: string;
	treasuryLp: string | null;
	creator: string;
	tier: number;
	state: LaunchState | string;
	totalDeposited: string;
	bonusPool: string;
	depositorCount: number;
	capacity: string;
	v2BuyBnb: string;
	vestingEnabled: boolean;
	closeTimestamp: number | null;
	launchTimestamp: number | null;
	v2Pair: string | null;
	openMcBnb: string | null;
	metadataUri: string | null;
	metadata?: Record<string, unknown>;
	createTxHash: string | null;
	createdAt: string;
	updatedAt: string;
};

export type PositionAggregate = {
	/** net deposit in wei (deposited - withdrawn). zero or positive. */
	deposited: string;
	/** gross deposited (sum of indexed Deposited events) in wei. */
	grossDeposited: string;
	/** sum of indexed Withdrawn refunds in wei. */
	withdrawn: string;
	/** total tokens already claimed in token wei. */
	claimed: string;
	/** on-chain `claimableOf(user)` in token wei; null if RPC unavailable. */
	claimable: string | null;
	/** on-chain pro-rata token allocation snapshot; null if not launched yet. */
	totalAllocation: string | null;
	/** 0..1 fraction of the linear vesting window elapsed. */
	vestingProgress: number;
};

export type UserLaunchEntry = {
	launch: SerializedAgentLaunch;
	position: PositionAggregate;
};

export type UserLaunchesResponse = {
	launches: UserLaunchEntry[];
	count: number;
};

export const userLaunchesQueryKey = (address: string | undefined) => ["user-launches", address ?? null] as const;

export function usePortfolioLaunches(address: string | undefined) {
	return useQuery<UserLaunchEntry[]>({
		queryKey: userLaunchesQueryKey(address),
		enabled: Boolean(address),
		queryFn: async () => {
			if (!address) return [];
			try {
				const data = await apiFetch<UserLaunchesResponse>(
					`/v2/users/${encodeURIComponent(address.toLowerCase())}/launches`,
				);
				if (data && Array.isArray(data.launches)) return data.launches;
				return [];
			} catch (err) {
				if (isApiError(err)) {
					const apiErr = err as ApiError;
					// Endpoint may not be deployed yet — surface empty so the
					// dashboard still renders the wagmi-only fallback.
					if (apiErr.status === 404 || apiErr.status === 501) return [];
				}
				throw err;
			}
		},
		refetchInterval: 30_000,
		retry: 1,
	});
}

/**
 * Group helpers used by the dashboard. The "active" bucket holds open or
 * closed launches (still pre-distribution); "claimable" is launched and
 * has on-chain claimable > 0; "history" is everything else (claim done
 * or fully vested with no balance left to act on).
 */
export function isActive(entry: UserLaunchEntry): boolean {
	return entry.launch.state === "open" || entry.launch.state === "closed";
}

export function isClaimable(entry: UserLaunchEntry): boolean {
	if (entry.launch.state !== "launched") return false;
	const c = entry.position.claimable;
	if (!c) return false;
	try {
		return BigInt(c) > 0n;
	} catch {
		return false;
	}
}

export function isHistorical(entry: UserLaunchEntry): boolean {
	if (entry.launch.state === "failed") return true;
	if (entry.launch.state !== "launched") return false;
	if (isClaimable(entry)) return false;
	// Launched + nothing claimable + has been claimed (or zero alloc) → history
	return true;
}
