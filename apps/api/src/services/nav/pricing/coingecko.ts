import { NAV_CHAIN_CONFIG } from "../chains.js";
import type { EvmNavChain, TokenPrice } from "../types.js";

// -----------------------------------------------------------------------------
// Narrow BNB/USD helper (used by burn-rate service)
// -----------------------------------------------------------------------------

const BNB_PRICE_CACHE_TTL_MS = 60_000;

let cachedBnbPrice: { value: number; expiresAt: number } | null = null;

export async function fetchBnbPriceUsd(fetchImpl: typeof fetch = fetch): Promise<number | null> {
	const now = Date.now();
	if (cachedBnbPrice && cachedBnbPrice.expiresAt > now) return cachedBnbPrice.value;

	const res = await fetchImpl("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd", {
		headers: { accept: "application/json" },
	});
	if (!res.ok) return null;

	const data = (await res.json()) as { binancecoin?: { usd?: unknown } };
	const price = data.binancecoin?.usd;
	if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;

	cachedBnbPrice = { value: price, expiresAt: now + BNB_PRICE_CACHE_TTL_MS };
	return price;
}

export function __resetCoingeckoPriceCacheForTest(): void {
	cachedBnbPrice = null;
	tokenCache.clear();
	nativeCache.clear();
}

// -----------------------------------------------------------------------------
// Broad multi-chain/multi-token helpers (used by NAV aggregator)
// -----------------------------------------------------------------------------

const TOKEN_TTL_MS = 60_000;
const tokenCache = new Map<string, { expiresAt: number; price: TokenPrice }>();
const nativeCache = new Map<string, { expiresAt: number; price: TokenPrice }>();

export type CoinGeckoDeps = { fetch?: typeof fetch; now?: () => number };

function nowMs(deps: CoinGeckoDeps): number {
	return deps.now?.() ?? Date.now();
}

function cacheGet(map: typeof tokenCache, key: string, now: number): TokenPrice | undefined {
	const item = map.get(key);
	if (!item || item.expiresAt <= now) return undefined;
	return item.price;
}

function cacheSet(map: typeof tokenCache, key: string, price: TokenPrice, now: number): void {
	map.set(key, { expiresAt: now + TOKEN_TTL_MS, price });
}

export function clearCoinGeckoPriceCacheForTest(): void {
	tokenCache.clear();
	nativeCache.clear();
	cachedBnbPrice = null;
}

export async function fetchCoinGeckoTokenPrices(
	chain: EvmNavChain,
	contracts: string[],
	deps: CoinGeckoDeps = {},
): Promise<Record<string, TokenPrice>> {
	const fetchImpl = deps.fetch ?? fetch;
	const now = nowMs(deps);
	const platform = NAV_CHAIN_CONFIG[chain]!.coingeckoPlatform;
	const output: Record<string, TokenPrice> = {};
	const missing: string[] = [];
	for (const contract of [...new Set(contracts.map((c) => c.toLowerCase()))]) {
		const key = `${platform}:${contract}`;
		const cached = cacheGet(tokenCache, key, now);
		if (cached) output[contract] = cached;
		else missing.push(contract);
	}
	for (let i = 0; i < missing.length; i += 100) {
		const batch = missing.slice(i, i + 100);
		if (batch.length === 0) continue;
		const url = new URL(`https://api.coingecko.com/api/v3/simple/token_price/${platform}`);
		url.searchParams.set("contract_addresses", batch.join(","));
		url.searchParams.set("vs_currencies", "usd");
		const res = await fetchImpl(url);
		if (!res.ok) throw new Error(`coingecko ${platform} http-${res.status}`);
		const json = (await res.json()) as Record<string, { usd?: number }>;
		for (const contract of batch) {
			const usd = json[contract]?.usd ?? json[contract.toLowerCase()]?.usd;
			const price: TokenPrice =
				typeof usd === "number"
					? { priceUsd: usd, priced: true, source: "coingecko" }
					: { priceUsd: null, priced: false, source: "unpriced" };
			output[contract] = price;
			cacheSet(tokenCache, `${platform}:${contract}`, price, now);
		}
	}
	return output;
}

export async function fetchCoinGeckoNativePrices(
	chains: EvmNavChain[],
	deps: CoinGeckoDeps = {},
): Promise<Record<string, TokenPrice>> {
	const fetchImpl = deps.fetch ?? fetch;
	const now = nowMs(deps);
	const output: Record<string, TokenPrice> = {};
	const ids = [...new Set(chains.map((chain) => NAV_CHAIN_CONFIG[chain]!.coingeckoNativeId))];
	const missing: string[] = [];
	for (const id of ids) {
		const cached = cacheGet(nativeCache, id, now);
		if (cached) output[id] = cached;
		else missing.push(id);
	}
	if (missing.length > 0) {
		const url = new URL("https://api.coingecko.com/api/v3/simple/price");
		url.searchParams.set("ids", missing.join(","));
		url.searchParams.set("vs_currencies", "usd");
		const res = await fetchImpl(url);
		if (!res.ok) throw new Error(`coingecko native http-${res.status}`);
		const json = (await res.json()) as Record<string, { usd?: number }>;
		for (const id of missing) {
			const usd = json[id]?.usd;
			const price: TokenPrice =
				typeof usd === "number"
					? { priceUsd: usd, priced: true, source: "native" }
					: { priceUsd: null, priced: false, source: "unpriced" };
			output[id] = price;
			cacheSet(nativeCache, id, price, now);
		}
	}
	return output;
}
