/**
 * Maps discovery UI search-params (sort, lifecycle) to the current API contract.
 *
 * The backend getTokens endpoint currently uses a single `category` field for
 * both sort order and lifecycle filtering.  This adapter keeps the UI aligned
 * with the new discovery contract (sort + lifecycle) while the api-parity
 * worker updates api.ts to accept them natively.
 *
 * Remove this adapter once api.ts exposes sort / lifecycle directly.
 */

export type DiscoverySort = "trending" | "new" | "marketCap";
export type DiscoveryLifecycle = "all" | "bonding" | "bonded";

/** Default sort when nothing is specified. */
export const DEFAULT_SORT: DiscoverySort = "trending";

const SORT_TO_CATEGORY: Record<DiscoverySort, string> = {
	trending: "trending",
	new: "new",
	marketCap: "marketcap",
};

const LIFECYCLE_TO_CATEGORY: Record<Exclude<DiscoveryLifecycle, "all">, string> = {
	bonding: "about-to-bond",
	bonded: "bonded",
};

/**
 * Convert discovery UI params -> shape expected by getTokens.
 * Lifecycle filters take priority over sort-based categories.
 */
export function toApiSearchParams(params: {
	sort?: string | null;
	lifecycle?: string | null;
	origin?: string | null;
	page?: number;
	search?: string;
	limit?: number;
}): Record<string, string | number | undefined> {
	const sort = (params.sort as DiscoverySort) || DEFAULT_SORT;
	const lifecycle = params.lifecycle as DiscoveryLifecycle | null;

	let category: string;
	if (lifecycle && lifecycle !== "all" && lifecycle in LIFECYCLE_TO_CATEGORY) {
		category = LIFECYCLE_TO_CATEGORY[lifecycle as Exclude<DiscoveryLifecycle, "all">];
	} else {
		category = SORT_TO_CATEGORY[sort] || SORT_TO_CATEGORY[DEFAULT_SORT];
	}

	return {
		category,
		origin: params.origin ?? undefined,
		page: params.page,
		search: params.search,
		limit: params.limit,
	};
}
