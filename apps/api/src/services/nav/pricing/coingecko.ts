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
}
