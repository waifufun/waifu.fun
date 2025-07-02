import type { TChain, TChainId } from "@autofun/types";
import DB from "@autofun/database";

interface AdminTokenQueryParams {
	hideImported?: number;
	search?: string;
	sortBy?: string;
	sortOrder?: string;
	limit?: number;
	page?: number;
	chain?: TChain;
	chainId?: TChainId;
}

interface AdminTokenFilters {
	hideImported?: number;
	search?: string;
	chain?: TChain;
	chainId?: TChainId;
}

export function buildAdminTokenFilters(params: AdminTokenFilters): Record<string, unknown> {
	const filters: Record<string, unknown> = {};

	if (params.hideImported === 1) {
		filters.imported = { $ne: true };
	}

	if (params.search) {
		filters.$or = [
			{ name: { $regex: params.search, $options: "i" } },
			{ ticker: { $regex: params.search, $options: "i" } },
			{ contractAddress: { $regex: params.search, $options: "i" } },
		];
	}

	if (params.chain) {
		filters.chain = params.chain;
	}

	if (params.chainId) {
		filters.chainId = params.chainId;
	}

	return filters;
}

export function buildAdminTokenSort(sortBy: string, sortOrder: string): Record<string, 1 | -1> {
	const sortOptions: Record<string, 1 | -1> = {};
	const validSortFields = ["createdAt", "marketCapUSD", "volume24h", "holders", "featured", "verified"];

	if (sortBy === "featured") {
		sortOptions.featured = sortOrder.toLowerCase() === "desc" ? -1 : 1;
		sortOptions.createdAt = -1;
	} else if (validSortFields.includes(sortBy)) {
		sortOptions[sortBy] = sortOrder.toLowerCase() === "desc" ? -1 : 1;
	} else {
		sortOptions.createdAt = -1;
	}

	return sortOptions;
}

export async function getAdminTokens(params: AdminTokenQueryParams) {
	const {
		hideImported,
		search,
		sortBy = "createdAt",
		sortOrder = "desc",
		limit = 50,
		page = 1,
		chain,
		chainId,
	} = params;

	const skip = (page - 1) * limit;
	const filters = buildAdminTokenFilters({ hideImported, search, chain, chainId });
	const sortOptions = buildAdminTokenSort(sortBy, sortOrder);

	const tokens = await DB.Token.find(filters)
		.sort(sortOptions)
		.skip(skip)
		.limit(limit)
		.lean();

	const total = await DB.Token.countDocuments(filters);

	return { tokens, total };
}

export async function getAdminTokenStats() {
	const stats = await DB.Token.aggregate([
		{
			$group: {
				_id: null,
				totalTokens: { $sum: 1 },
				totalVolume: { $sum: "$volume24h" },
				avgMarketCap: { $avg: "$marketCapUSD" },
				featuredCount: {
					$sum: { $cond: ["$featured", 1, 0] },
				},
				verifiedCount: {
					$sum: { $cond: ["$verified", 1, 0] },
				},
				hiddenCount: {
					$sum: { $cond: ["$hidden", 1, 0] },
				},
			},
		},
	]);

	return stats[0] || {
		totalTokens: 0,
		totalVolume: 0,
		avgMarketCap: 0,
		featuredCount: 0,
		verifiedCount: 0,
		hiddenCount: 0,
	};
} 