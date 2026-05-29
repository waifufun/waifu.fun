import { formatEther, getAddress } from "viem";
import { getNavPublicClient } from "./chains.js";
import { fetchBnbPriceUsd } from "./pricing/coingecko.js";

/**
 * Lightweight treasury valuation for list-shaped consumers (leaderboard,
 * /agents grid). Full NAV (`buildNavSnapshot`) enumerates every registered
 * wallet across chains and is far too heavy to run per row on a list endpoint.
 * The leaderboard only needs a single dollar figure per agent, so we read the
 * agent Safe's native BNB balance and price it with the shared CoinGecko BNB
 * quote — the same "safe BNB × price" path the agent-detail hero falls back to.
 *
 * Results are cached per Safe address (60s) so repeated list renders don't fan
 * out fresh RPC calls. See waifufun#744.
 */

const SAFE_BALANCE_CACHE_TTL_MS = 60_000;

const safeBnbCache = new Map<string, { balanceBnb: number; expiresAt: number }>();

export interface TreasurySummaryResult {
	/** Shared BNB/USD quote used for every row (one fetch). */
	bnbPriceUsd: number | null;
	/** lowercased Safe address → treasury value in USD. */
	treasuryUsdByAddress: Map<string, number>;
}

async function readSafeBnbBalance(address: string, now: number): Promise<number | null> {
	const key = address.toLowerCase();
	const cached = safeBnbCache.get(key);
	if (cached && cached.expiresAt > now) return cached.balanceBnb;
	try {
		const client = getNavPublicClient("bsc");
		const wei = await client.getBalance({ address: getAddress(address) });
		const balanceBnb = Number(formatEther(wei));
		if (!Number.isFinite(balanceBnb)) return cached?.balanceBnb ?? null;
		safeBnbCache.set(key, { balanceBnb, expiresAt: now + SAFE_BALANCE_CACHE_TTL_MS });
		return balanceBnb;
	} catch {
		// RPC hiccup: fall back to the last good cached value if we have one
		// rather than poisoning the row with a hard 0.
		return cached?.balanceBnb ?? null;
	}
}

/**
 * Compute treasury USD for a batch of agent Safe addresses. Invalid/empty
 * addresses are skipped. Returns a partial map — callers should treat a
 * missing key as "no data" (render a dash), not as $0.
 */
export async function buildTreasurySummary(
	addresses: Array<string | null | undefined>,
): Promise<TreasurySummaryResult> {
	const now = Date.now();
	const unique = [
		...new Set(
			addresses
				.filter((a): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a))
				.map((a) => a.toLowerCase()),
		),
	];

	const treasuryUsdByAddress = new Map<string, number>();
	if (unique.length === 0) return { bnbPriceUsd: null, treasuryUsdByAddress };

	const bnbPriceUsd = await fetchBnbPriceUsd();
	if (bnbPriceUsd === null) return { bnbPriceUsd: null, treasuryUsdByAddress };

	const balances = await Promise.all(unique.map((addr) => readSafeBnbBalance(addr, now)));
	unique.forEach((addr, i) => {
		const balanceBnb = balances[i];
		if (balanceBnb === null || balanceBnb === undefined) return;
		treasuryUsdByAddress.set(addr, Number((balanceBnb * bnbPriceUsd).toFixed(2)));
	});

	return { bnbPriceUsd, treasuryUsdByAddress };
}

export function __resetTreasurySummaryCacheForTest(): void {
	safeBnbCache.clear();
}
