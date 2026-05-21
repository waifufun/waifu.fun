/**
 * Token logo resolver.
 *
 * Async cascade for any ERC-20-shaped token + an in-memory session cache so
 * a given token only hits the network once. Designed to be Lqy.fi-friendly:
 * resolution sources are pluggable via a single ENV switch, and a JSON
 * manifest (token-logos.json) overrides anything the cascade returns.
 *
 * Cascade order (default `NEXT_PUBLIC_TOKEN_LOGO_SOURCES=dexscreener,trustwallet,coingecko`):
 *   1. local manifest      lib/token-logos.json     symbol or chain:address key
 *   2. dexscreener         api.dexscreener.com      pairs[*].info.imageUrl
 *   3. trustwallet         raw.githubusercontent... blockchains/<chain>/assets/<addr>/logo.png
 *   4. coingecko           api.coingecko.com        coins/<platform>/contract/<addr>
 *
 * Add a hand override: edit token-logos.json. Keys are either
 *   - "chain:address" with lowercase address, or
 *   - "symbol:SYMBOL" for chain-agnostic mappings.
 *
 * Static-export safe: this module only runs in the browser (it makes fetch
 * calls); panels gate hydration through React effects so SSG sees no calls.
 */

import manifest from "./token-logos.json";

export type TokenChain = "bsc" | "ethereum" | "polygon" | "solana" | "base";

export type TokenLogoOptions = {
	chain: TokenChain;
	address: string;
	symbol?: string;
};

type Source = "manifest" | "dexscreener" | "trustwallet" | "coingecko";

const DEFAULT_SOURCES: Source[] = ["dexscreener", "trustwallet", "coingecko"];

// in-memory cache shared across all callers in a session. Keyed by
// `chain:address` (address lowercased). null sentinel means "tried and
// nothing worked, do not try again this session".
type CacheEntry = string | null;
const CACHE = new Map<string, CacheEntry>();

const TRUSTWALLET_CHAIN: Record<TokenChain, string> = {
	bsc: "smartchain",
	ethereum: "ethereum",
	polygon: "polygon",
	solana: "solana",
	base: "base",
};

const COINGECKO_PLATFORM: Record<TokenChain, string> = {
	bsc: "binance-smart-chain",
	ethereum: "ethereum",
	polygon: "polygon-pos",
	solana: "solana",
	base: "base",
};

function getSources(): Source[] {
	const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_TOKEN_LOGO_SOURCES : undefined;
	if (!raw) return DEFAULT_SOURCES;
	const parsed = raw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter((s): s is Source => s === "dexscreener" || s === "trustwallet" || s === "coingecko");
	return parsed.length > 0 ? parsed : DEFAULT_SOURCES;
}

type Manifest = Record<string, string>;
function manifestLookup(opts: TokenLogoOptions): string | null {
	const m = manifest as Manifest;
	const addrKey = `${opts.chain}:${opts.address.toLowerCase()}`;
	if (addrKey in m) return m[addrKey] ?? null;
	if (opts.symbol) {
		const symKey = `symbol:${opts.symbol.toUpperCase()}`;
		if (symKey in m) return m[symKey] ?? null;
	}
	return null;
}

async function fromDexscreener(opts: TokenLogoOptions): Promise<string | null> {
	try {
		const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${opts.address}`, {
			headers: { accept: "application/json" },
		});
		if (!r.ok) return null;
		const j = (await r.json()) as {
			pairs?: Array<{ info?: { imageUrl?: string }; baseToken?: { address?: string } }>;
		};
		const pairs = j.pairs ?? [];
		for (const p of pairs) {
			const img = p.info?.imageUrl;
			if (img && typeof img === "string" && img.startsWith("http")) return img;
		}
		return null;
	} catch {
		return null;
	}
}

async function fromTrustwallet(opts: TokenLogoOptions): Promise<string | null> {
	const chainPath = TRUSTWALLET_CHAIN[opts.chain];
	if (!chainPath) return null;
	// TrustWallet stores assets under checksum address; we don't have a
	// checksumming library on the FE so we try both lowercase and the raw
	// input. If neither resolves, fall through to the next source.
	const candidates = [opts.address, opts.address.toLowerCase()];
	for (const addr of candidates) {
		const url = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainPath}/assets/${addr}/logo.png`;
		try {
			const r = await fetch(url, { method: "GET" });
			if (r.ok) return url;
		} catch {
			// keep trying
		}
	}
	return null;
}

async function fromCoingecko(opts: TokenLogoOptions): Promise<string | null> {
	const platform = COINGECKO_PLATFORM[opts.chain];
	if (!platform) return null;
	try {
		const r = await fetch(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${opts.address.toLowerCase()}`, {
			headers: { accept: "application/json" },
		});
		if (!r.ok) return null;
		const j = (await r.json()) as { image?: { large?: string; small?: string; thumb?: string } };
		return j.image?.large ?? j.image?.small ?? j.image?.thumb ?? null;
	} catch {
		return null;
	}
}

async function runSource(src: Source, opts: TokenLogoOptions): Promise<string | null> {
	if (src === "dexscreener") return fromDexscreener(opts);
	if (src === "trustwallet") return fromTrustwallet(opts);
	if (src === "coingecko") return fromCoingecko(opts);
	return null;
}

export async function resolveTokenLogo(opts: TokenLogoOptions): Promise<string | null> {
	if (!opts.address && !opts.symbol) return null;
	const cacheKey = `${opts.chain}:${opts.address.toLowerCase()}|${opts.symbol ?? ""}`;
	if (CACHE.has(cacheKey)) return CACHE.get(cacheKey) ?? null;

	// 1. manifest overrides
	const manual = manifestLookup(opts);
	if (manual) {
		CACHE.set(cacheKey, manual);
		return manual;
	}

	// Manifest miss but no address: nothing to cascade on.
	if (!opts.address) {
		CACHE.set(cacheKey, null);
		return null;
	}

	// 2..n: cascade
	for (const src of getSources()) {
		const hit = await runSource(src, opts);
		if (hit) {
			CACHE.set(cacheKey, hit);
			return hit;
		}
	}

	CACHE.set(cacheKey, null);
	return null;
}

/** Reset the in-memory cache. Mostly useful in tests. */
export function clearTokenLogoCache(): void {
	CACHE.clear();
}
