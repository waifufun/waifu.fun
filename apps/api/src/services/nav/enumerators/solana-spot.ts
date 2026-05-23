import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type { AgentWalletForNav } from "../aggregator.js";
import type { EnumerationResult, Holding, NavStaleSource, TokenPrice } from "../types.js";

export const SOLANA_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";
export const SOLANA_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const BONK_MINT = "DezXAZ8z7PnrnRJjz3b263263mWCR5vGZ5QH1iL5j2B";
export const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

const SOL_COINGECKO_ID = "solana";
const TOKEN_LIST_TTL_MS = 10 * 60_000;
const PRICE_TTL_MS = 60_000;

type SolanaTokenMetadata = { address: string; symbol: string; name?: string; logoURI?: string };

type SolanaTokenBalance = {
	asset: string;
	contract: string | null;
	balance: number;
	decimals: number;
	raw: string;
	metadata?: SolanaTokenMetadata;
};

const CURATED_SOLANA_TOKENS = new Map<string, SolanaTokenMetadata>([
	[WSOL_MINT, { address: WSOL_MINT, symbol: "SOL", name: "Wrapped SOL" }],
	[SOLANA_USDC_MINT, { address: SOLANA_USDC_MINT, symbol: "USDC", name: "USD Coin" }],
	[BONK_MINT, { address: BONK_MINT, symbol: "BONK", name: "Bonk" }],
	[JUP_MINT, { address: JUP_MINT, symbol: "JUP", name: "Jupiter" }],
]);

export type SolanaConnectionLike = Pick<Connection, "getBalance" | "getParsedTokenAccountsByOwner">;

export type SolanaSpotDeps = {
	fetch?: typeof fetch;
	getConnection?: () => SolanaConnectionLike;
	now?: () => number;
};

type ParsedTokenAccount = {
	account: {
		data: {
			parsed?: {
				info?: {
					mint?: string;
					tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null; uiAmountString?: string };
				};
			};
		};
	};
};

let tokenListCache: { expiresAt: number; tokens: Map<string, SolanaTokenMetadata> } | null = null;
const priceCache = new Map<string, { expiresAt: number; price: TokenPrice }>();

function nowMs(deps: SolanaSpotDeps): number {
	return deps.now?.() ?? Date.now();
}

export function getSolanaRpcUrl(): string {
	return process.env.SOLANA_RPC_URL?.trim() || SOLANA_PUBLIC_RPC_URL;
}

export function getSolanaConnection(): Connection {
	return new Connection(getSolanaRpcUrl(), "confirmed");
}

function decimalBalance(raw: string, decimals: number): number {
	const value = BigInt(raw || "0");
	if (value <= 0n) return 0;
	const scale = 10n ** BigInt(decimals);
	const whole = value / scale;
	const fraction = value % scale;
	if (fraction === 0n) return Number(whole);
	return Number(`${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`);
}

async function fetchJupiterTokenList(deps: SolanaSpotDeps): Promise<Map<string, SolanaTokenMetadata>> {
	const now = nowMs(deps);
	if (tokenListCache && tokenListCache.expiresAt > now) return tokenListCache.tokens;
	const fetchImpl = deps.fetch ?? fetch;
	const urls = [
		"https://token.jup.ag/strict",
		"https://token.jup.ag/all",
		"https://tokens.jup.ag/tokens?tags=verified",
	];
	let lastError: unknown;
	for (const url of urls) {
		try {
			const res = await fetchImpl(url, { headers: { accept: "application/json" } });
			if (!res.ok) throw new Error(`http-${res.status}`);
			const json = (await res.json()) as Array<{ address?: string; symbol?: string; name?: string; logoURI?: string }>;
			const tokens = new Map(CURATED_SOLANA_TOKENS);
			for (const token of Array.isArray(json) ? json : []) {
				if (!token.address || !token.symbol) continue;
				tokens.set(token.address, {
					address: token.address,
					symbol: token.symbol,
					...(token.name ? { name: token.name } : {}),
					...(token.logoURI ? { logoURI: token.logoURI } : {}),
				});
			}
			tokenListCache = { expiresAt: now + TOKEN_LIST_TTL_MS, tokens };
			return tokens;
		} catch (err) {
			lastError = err;
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchJupiterPrice(mint: string, deps: SolanaSpotDeps): Promise<TokenPrice> {
	const fetchImpl = deps.fetch ?? fetch;
	const url = new URL("https://price.jup.ag/v6/price");
	url.searchParams.set("ids", mint);
	const res = await fetchImpl(url, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`jupiter http-${res.status}`);
	const json = (await res.json()) as { data?: Record<string, { price?: number }> };
	const price = json.data?.[mint]?.price;
	return typeof price === "number" && Number.isFinite(price) && price > 0
		? { priceUsd: price, priced: true, source: "jupiter" }
		: { priceUsd: null, priced: false, source: "unpriced" };
}

async function fetchCoinGeckoSolanaPrice(mint: string, deps: SolanaSpotDeps): Promise<TokenPrice> {
	const fetchImpl = deps.fetch ?? fetch;
	const isNative = mint === WSOL_MINT;
	const url = isNative
		? new URL("https://api.coingecko.com/api/v3/simple/price")
		: new URL("https://api.coingecko.com/api/v3/simple/token_price/solana");
	if (isNative) url.searchParams.set("ids", SOL_COINGECKO_ID);
	else url.searchParams.set("contract_addresses", mint);
	url.searchParams.set("vs_currencies", "usd");
	const res = await fetchImpl(url, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`coingecko solana http-${res.status}`);
	const json = (await res.json()) as Record<string, { usd?: number }>;
	const usd = isNative ? json[SOL_COINGECKO_ID]?.usd : (json[mint]?.usd ?? json[mint.toLowerCase()]?.usd);
	return typeof usd === "number" && Number.isFinite(usd) && usd > 0
		? { priceUsd: usd, priced: true, source: "coingecko" }
		: { priceUsd: null, priced: false, source: "unpriced" };
}

async function fetchDexScreenerPrice(mint: string, deps: SolanaSpotDeps): Promise<TokenPrice> {
	const fetchImpl = deps.fetch ?? fetch;
	const res = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, {
		headers: { accept: "application/json" },
	});
	if (!res.ok) throw new Error(`dexscreener http-${res.status}`);
	const json = (await res.json()) as { pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number } }> };
	const best = (Array.isArray(json.pairs) ? json.pairs : [])
		.map((pair) => ({ price: Number(pair.priceUsd), liquidity: Number(pair.liquidity?.usd ?? 0) }))
		.filter((pair) => Number.isFinite(pair.price) && pair.price > 0)
		.sort((a, b) => b.liquidity - a.liquidity)[0];
	return best
		? { priceUsd: best.price, priced: true, source: "dexscreener" }
		: { priceUsd: null, priced: false, source: "unpriced" };
}

export async function fetchSolanaTokenPrice(mint: string, deps: SolanaSpotDeps = {}): Promise<TokenPrice> {
	const now = nowMs(deps);
	const cached = priceCache.get(mint);
	if (cached && cached.expiresAt > now) return cached.price;
	for (const source of [fetchJupiterPrice, fetchCoinGeckoSolanaPrice, fetchDexScreenerPrice]) {
		try {
			const price = await source(mint, deps);
			if (price.priced) {
				priceCache.set(mint, { expiresAt: now + PRICE_TTL_MS, price });
				return price;
			}
		} catch {}
	}
	const unpriced: TokenPrice = { priceUsd: null, priced: false, source: "unpriced" };
	priceCache.set(mint, { expiresAt: now + PRICE_TTL_MS, price: unpriced });
	return unpriced;
}

async function enumerateSolanaBalances(
	walletAddress: string,
	deps: SolanaSpotDeps,
): Promise<EnumerationResult<SolanaTokenBalance>> {
	const stale: NavStaleSource[] = [];
	try {
		const connection = deps.getConnection?.() ?? getSolanaConnection();
		const owner = new PublicKey(walletAddress);
		const [lamports, tokenAccounts] = await Promise.all([
			connection.getBalance(owner),
			connection.getParsedTokenAccountsByOwner(owner, { programId: SOLANA_TOKEN_PROGRAM_ID }),
		]);
		let tokens = new Map(CURATED_SOLANA_TOKENS);
		try {
			tokens = await fetchJupiterTokenList(deps);
		} catch (err) {
			stale.push({ source: "jupiter:token-list", reason: err instanceof Error ? err.message : String(err) });
		}

		const holdings: SolanaTokenBalance[] = [];
		if (lamports > 0) {
			holdings.push({
				asset: "SOL",
				contract: null,
				balance: lamports / LAMPORTS_PER_SOL,
				decimals: 9,
				raw: String(lamports),
			});
		}
		for (const item of tokenAccounts.value as ParsedTokenAccount[]) {
			const info = item.account.data.parsed?.info;
			const mint = info?.mint;
			const amount = info?.tokenAmount;
			const raw = amount?.amount ?? "0";
			if (!mint || BigInt(raw) <= 0n) continue;
			const decimals = Number(amount?.decimals ?? 0);
			const metadata = tokens.get(mint);
			holdings.push({
				asset: metadata?.symbol ?? mint.slice(0, 8),
				contract: mint,
				balance: amount?.uiAmount != null ? amount.uiAmount : decimalBalance(raw, decimals),
				decimals,
				raw,
				...(metadata ? { metadata } : {}),
			});
		}
		return { holdings, stale };
	} catch (err) {
		return {
			holdings: [],
			stale: [{ source: "solana:spot", reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}

function holdingFor(wallet: AgentWalletForNav, balance: SolanaTokenBalance, price: TokenPrice): Holding {
	const priceUsd = price.priced ? price.priceUsd : null;
	const valueUsd = priceUsd === null || priceUsd === undefined ? null : Number((balance.balance * priceUsd).toFixed(8));
	return {
		walletId: wallet.id,
		walletAddress: wallet.address,
		walletLabel: wallet.label,
		walletRole: wallet.role,
		chain: "solana",
		asset: balance.asset,
		contract: balance.contract,
		balance: balance.balance,
		priceUsd: priceUsd ?? null,
		valueUsd,
		priced: valueUsd !== null,
	};
}

export async function enumerateSolanaSpot(
	wallet: AgentWalletForNav | string,
	deps: SolanaSpotDeps = {},
): Promise<EnumerationResult<Holding>> {
	const walletForHolding: AgentWalletForNav =
		typeof wallet === "string"
			? { id: wallet, address: wallet, label: "Solana", role: "agent-hot", chain: "solana" }
			: wallet;
	const balances = await enumerateSolanaBalances(walletForHolding.address, deps);
	const holdings = await Promise.all(
		balances.holdings.map(async (balance) => {
			const price = await fetchSolanaTokenPrice(balance.contract ?? WSOL_MINT, deps);
			return holdingFor(walletForHolding, balance, price);
		}),
	);
	return { holdings, stale: balances.stale };
}

export function clearSolanaSpotCachesForTest(): void {
	tokenListCache = null;
	priceCache.clear();
}

export const __privateSolanaSpot = {
	CURATED_SOLANA_TOKENS,
	decimalBalance,
	fetchJupiterTokenList,
};
