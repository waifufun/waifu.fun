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
	HL_CACHE.clear();
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hyperliquid asset logo resolution (symbol/ticker based).
 *
 * Hyperliquid's API exposes NO logo field for any asset (verified: the perp
 * `meta` only carries names like "xyz:SPCX" or "BTC"). So the ERC-20 cascade
 * above (which keys on chain:address) cannot resolve them. HL assets have no
 * contract address.
 *
 * Two kinds of HL asset:
 *
 *   1. Core crypto perps        BTC, ETH, SOL, BNB, HYPE, NEAR, ...
 *      → resolve to the coin's crypto logo (manifest SVG first, then a
 *        coingecko-by-id lookup for coins we don't ship a local mark for).
 *
 *   2. HIP-3 builder synthetic equities    xyz:SPCX, xyz:AAPL, xyz:TSLA, ...
 *      The "xyz:" is the builder-dex prefix; the real ticker is the part
 *      after the colon (SPCX, AAPL, TSLA). These are real-world equities, so
 *      we resolve them through a company-logo-by-ticker source.
 *
 * Logo source for equities: logo.dev (https://img.logo.dev/ticker/<TICKER>).
 * Chosen because it serves clean, square, transparent company marks keyed by
 * stock ticker (exactly our key), has a generous tokenless tier, and returns
 * a real image URL we can hand straight to <img>. A token only raises rate
 * limits / removes the "demo" watermark — so it's optional. We degrade
 * gracefully: no token still works, and any miss falls back to a monogram
 * avatar rendered by <TokenIcon>, never a broken image.
 *
 * Env: NEXT_PUBLIC_LOGO_DEV_TOKEN (optional). If unset, logo.dev is still
 * queried tokenless. Set it to lift limits in production.
 *
 * Static-export safe: browser-only fetch, gated through <TokenIcon> effects.
 * Session in-memory cache keyed by the normalized ticker.
 * ────────────────────────────────────────────────────────────────────────── */

// Separate cache for HL symbol lookups (keyed by normalized ticker, not
// chain:address). null = tried, nothing found, do not retry this session.
const HL_CACHE = new Map<string, CacheEntry>();

// Known Hyperliquid core crypto perps → coingecko coin id. Used to fetch a
// crypto logo for coins we don't ship a hand-vector for in token-logos.json.
// The manifest (symbol:SYMBOL) still wins first, so coins WITH a local SVG
// (btc/eth/sol/bnb/near/hype/zec/usdc) never reach this map.
const HL_COIN_COINGECKO_ID: Record<string, string> = {
	BTC: "bitcoin",
	ETH: "ethereum",
	SOL: "solana",
	BNB: "binancecoin",
	HYPE: "hyperliquid",
	NEAR: "near",
	ZEC: "zcash",
	AVAX: "avalanche-2",
	ARB: "arbitrum",
	OP: "optimism",
	MATIC: "matic-network",
	DOGE: "dogecoin",
	WIF: "dogwifcoin",
	PEPE: "pepe",
	SUI: "sui",
	APT: "aptos",
	TIA: "celestia",
	SEI: "sei-network",
	INJ: "injective-protocol",
	LINK: "chainlink",
	LTC: "litecoin",
	XRP: "ripple",
	ADA: "cardano",
	DOT: "polkadot",
	ATOM: "cosmos",
	FTM: "fantom",
	AAVE: "aave",
	UNI: "uniswap",
	TRX: "tron",
	KAS: "kaspa",
	TON: "the-open-network",
	FARTCOIN: "fartcoin",
	ENA: "ethena",
	JUP: "jupiter-exchange-solana",
	BONK: "bonk",
};

// The set of crypto-ish tickers we recognise as coins (manifest symbols +
// the coingecko map). Anything NOT in here, after stripping the dex prefix,
// is treated as an equity ticker and routed to logo.dev.
const KNOWN_CRYPTO_SYMBOLS = new Set<string>([
	"BTC",
	"WBTC",
	"ETH",
	"WETH",
	"SOL",
	"BNB",
	"WBNB",
	"USDC",
	"USDT",
	"NEAR",
	"HYPE",
	"ZEC",
	...Object.keys(HL_COIN_COINGECKO_ID),
]);

/**
 * Normalize a raw HL asset name into a bare ticker.
 *   "xyz:SPCX" → "SPCX"    "BTC" → "BTC"    "  eth " → "ETH"
 * Strips a single leading "<dex>:" builder-dex prefix and uppercases.
 */
export function hlTicker(rawCoin: string): string {
	const trimmed = (rawCoin || "").trim();
	const afterPrefix = trimmed.includes(":") ? trimmed.slice(trimmed.indexOf(":") + 1) : trimmed;
	return afterPrefix.trim().toUpperCase();
}

/**
 * Heuristic: does this HL asset look like a synthetic equity (vs a crypto
 * coin)? An explicit builder-dex prefix ("xyz:") is the strongest signal; a
 * ticker we don't recognise as crypto is treated as an equity. Used so the
 * monogram fallback can pick a premium (equity) vs neutral (crypto) styling.
 */
export function isHlEquity(rawCoin: string): boolean {
	const hasDexPrefix = (rawCoin || "").includes(":");
	const ticker = hlTicker(rawCoin);
	if (KNOWN_CRYPTO_SYMBOLS.has(ticker)) return false;
	// dex-prefixed and not a known coin → equity. Bare unknown ticker → also
	// most likely an equity (HL core coins are all in KNOWN_CRYPTO_SYMBOLS or
	// the manifest), so default unknowns to equity styling.
	return hasDexPrefix || ticker.length > 0;
}

function logoDevToken(): string | null {
	const t = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN : undefined;
	return t?.trim() ? t.trim() : null;
}

/**
 * Build the logo.dev image URL for an equity ticker. logo.dev requires a
 * publishable token (the tokenless endpoint 401s), so we only return a URL
 * when NEXT_PUBLIC_LOGO_DEV_TOKEN is set. The publishable (pk_) key is safe
 * for client-side use per logo.dev's docs.
 *
 * We hand the URL straight to <img> rather than pre-fetching: logo.dev
 * serves a clean generic mark for unknown tickers and the <img onError>
 * path already falls back to our monogram, so a verification round-trip
 * would just double the requests. When no token is configured we return
 * null so the caller renders the premium monogram immediately (graceful,
 * no 401 noise, no broken image).
 */
function logoDevUrl(ticker: string): string | null {
	if (!ticker) return null;
	const token = logoDevToken();
	if (!token) return null; // tokenless logo.dev 401s; degrade to monogram
	const qs = new URLSearchParams({ token, format: "png", size: "128", retina: "true" });
	return `https://img.logo.dev/ticker/${encodeURIComponent(ticker)}?${qs.toString()}`;
}

/** Crypto coin ticker → coingecko image by coin id. */
async function fromCoingeckoById(ticker: string): Promise<string | null> {
	const id = HL_COIN_COINGECKO_ID[ticker];
	if (!id) return null;
	try {
		const r = await fetch(
			`https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
			{ headers: { accept: "application/json" } },
		);
		if (!r.ok) return null;
		const j = (await r.json()) as { image?: { large?: string; small?: string; thumb?: string } };
		return j.image?.large ?? j.image?.small ?? j.image?.thumb ?? null;
	} catch {
		return null;
	}
}

/**
 * Resolve a Hyperliquid asset logo by its (possibly dex-prefixed) name.
 *
 * Cascade:
 *   1. manifest          symbol:TICKER override (local crisp SVGs win)
 *   2. crypto coin        coingecko-by-id (for HL coins w/o a local mark)
 *   3. equity ticker      logo.dev company mark
 *   → null                caller renders a monogram avatar
 *
 * @param rawCoin e.g. "xyz:SPCX", "BTC", "HYPE"
 */
export async function resolveHlAssetLogo(rawCoin: string): Promise<string | null> {
	const ticker = hlTicker(rawCoin);
	if (!ticker) return null;
	if (HL_CACHE.has(ticker)) return HL_CACHE.get(ticker) ?? null;

	// 1. manifest override (local SVGs for the common coins)
	const m = manifest as Manifest;
	const symKey = `symbol:${ticker}`;
	if (symKey in m && m[symKey]) {
		const hit = m[symKey];
		HL_CACHE.set(ticker, hit);
		return hit;
	}

	// 2. known crypto coin without a local mark → coingecko
	if (KNOWN_CRYPTO_SYMBOLS.has(ticker)) {
		const cg = await fromCoingeckoById(ticker);
		HL_CACHE.set(ticker, cg);
		return cg;
	}

	// 3. everything else is treated as an equity ticker → logo.dev (if a token
	// is configured; otherwise null → premium monogram fallback in the icon).
	const eq = logoDevUrl(ticker);
	HL_CACHE.set(ticker, eq);
	return eq;
}
