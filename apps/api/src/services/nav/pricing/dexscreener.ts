import type { AgentWalletChain, TokenPrice } from "../types.js";

const TTL_MS = 60_000;
const MAX_TOKENS_PER_REQUEST = 30;

const cache = new Map<string, { expiresAt: number; price: TokenPrice }>();

export type DexScreenerChain =
	| Extract<AgentWalletChain, "bsc" | "eth" | "arb" | "base" | "op" | "polygon" | "solana">
	| "ethereum"
	| "arbitrum"
	| "optimism";
export type DexScreenerDeps = { fetch?: typeof fetch; now?: () => number };

type DexScreenerPair = {
	chainId?: string;
	priceUsd?: string | number | null;
	liquidity?: { usd?: string | number | null } | null;
	baseToken?: { address?: string | null } | null;
	quoteToken?: { address?: string | null } | null;
};

type DexScreenerResponse = {
	pairs?: DexScreenerPair[] | null;
};

const CHAIN_IDS: Record<string, string> = {
	bsc: "bsc",
	eth: "ethereum",
	ethereum: "ethereum",
	arb: "arbitrum",
	arbitrum: "arbitrum",
	base: "base",
	op: "optimism",
	optimism: "optimism",
	polygon: "polygon",
	solana: "solana",
};

export const SUPPORTED_DEXSCREENER_CHAINS = new Set<DexScreenerChain>([
	"bsc",
	"eth",
	"ethereum",
	"arb",
	"arbitrum",
	"base",
	"op",
	"optimism",
	"polygon",
	"solana",
]);

function nowMs(deps: DexScreenerDeps): number {
	return deps.now?.() ?? Date.now();
}

function cacheKey(chain: DexScreenerChain, contract: string): string {
	return `${chain}:${contract.toLowerCase()}`;
}

function cacheGet(key: string, now: number): TokenPrice | undefined {
	const item = cache.get(key);
	if (!item || item.expiresAt <= now) return undefined;
	return item.price;
}

function cacheSet(key: string, price: TokenPrice, now: number): void {
	cache.set(key, { expiresAt: now + TTL_MS, price });
}

function toFinitePositiveNumber(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAddress(value: unknown): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function unpriced(): TokenPrice {
	return { priceUsd: null, priced: false, source: "unpriced" };
}

function selectTokenPrice(chain: DexScreenerChain, contract: string, pairs: DexScreenerPair[]): TokenPrice {
	const chainId = CHAIN_IDS[chain];
	if (!chainId) return unpriced();
	const normalizedContract = normalizeAddress(contract);
	const candidates = pairs
		.filter((pair) => pair?.chainId === chainId)
		.filter((pair) => {
			const base = normalizeAddress(pair?.baseToken?.address);
			const quote = normalizeAddress(pair?.quoteToken?.address);
			if (!base && !quote) return true;
			return base === normalizedContract || quote === normalizedContract;
		})
		.map((pair) => ({
			priceUsd: toFinitePositiveNumber(pair?.priceUsd),
			liquidityUsd: toFinitePositiveNumber(pair?.liquidity?.usd) ?? 0,
		}))
		.filter((pair) => pair.priceUsd !== null)
		.sort((left, right) => right.liquidityUsd - left.liquidityUsd);

	const best = candidates[0];
	return best ? { priceUsd: best.priceUsd, priced: true, source: "dexscreener" } : unpriced();
}

async function fetchDexScreenerPairs(contracts: string[], fetchImpl: typeof fetch): Promise<DexScreenerPair[]> {
	const response = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${contracts.join(",")}`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) return [];
	const json = (await response.json()) as DexScreenerResponse;
	return Array.isArray(json.pairs) ? json.pairs : [];
}

export function clearDexScreenerPriceCacheForTest(): void {
	cache.clear();
}

export async function fetchDexScreenerTokenPrice(
	chain: DexScreenerChain,
	contract: string,
	deps: DexScreenerDeps = {},
): Promise<TokenPrice> {
	const prices = await fetchDexScreenerTokenPrices(chain, [contract], deps);
	return prices[contract.toLowerCase()] ?? unpriced();
}

export async function fetchDexScreenerTokenPrices(
	chain: DexScreenerChain,
	contracts: string[],
	deps: DexScreenerDeps = {},
): Promise<Record<string, TokenPrice>> {
	const fetchImpl = deps.fetch ?? fetch;
	const now = nowMs(deps);
	const output: Record<string, TokenPrice> = {};
	const missing: string[] = [];

	for (const contract of [...new Set(contracts.map((value) => value.trim()).filter(Boolean))]) {
		const outputKey = contract.toLowerCase();
		const key = cacheKey(chain, contract);
		const cached = cacheGet(key, now);
		if (cached) output[outputKey] = cached;
		else missing.push(contract);
	}

	for (let i = 0; i < missing.length; i += MAX_TOKENS_PER_REQUEST) {
		const batch = missing.slice(i, i + MAX_TOKENS_PER_REQUEST);
		const pairs = await fetchDexScreenerPairs(batch, fetchImpl);
		for (const contract of batch) {
			const price = selectTokenPrice(chain, contract, pairs);
			const outputKey = contract.toLowerCase();
			output[outputKey] = price;
			cacheSet(cacheKey(chain, contract), price, now);
		}
	}

	return output;
}
