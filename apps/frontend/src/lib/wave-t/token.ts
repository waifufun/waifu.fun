export type TokenMetrics = {
	contract: string;
	symbol: string;
	name: string;
	priceUsd: number;
	priceBnb: number;
	marketCap: number;
	liquidityUsd: number;
	holders: number;
	volume24h: number;
	txs24h: number;
	change24h: number;
	totalSupply: bigint;
	/** Raw balance held at the burn (dead) address. 0n when nothing burned. */
	burnedSupply: bigint;
	/** ERC-20 decimals, needed to humanize totalSupply / burnedSupply. */
	decimals: number;
};

const BSC_RPC =
	process.env.NEXT_PUBLIC_BSC_RPC_URL?.trim() ||
	process.env.NEXT_PUBLIC_EVM_RPC_URL?.trim() ||
	"https://bsc-dataseed.binance.org/";
const FALLBACK: TokenMetrics = {
	contract: "",
	symbol: "WAIFU",
	name: "Waifu Agent Token",
	priceUsd: 0,
	priceBnb: 0,
	marketCap: 0,
	liquidityUsd: 0,
	holders: 0,
	volume24h: 0,
	txs24h: 0,
	change24h: 0,
	totalSupply: 0n,
	burnedSupply: 0n,
	decimals: 18,
};

// Standard EVM burn sink. Tokens routed here are provably out of supply.
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/** ABI-encode balanceOf(address) calldata. */
function encodeBalanceOf(holder: string): string {
	const addr = holder.replace(/^0x/, "").toLowerCase().padStart(64, "0");
	return `0x70a08231${addr}`;
}

type DexPair = {
	baseToken?: { address?: string; name?: string; symbol?: string };
	priceUsd?: string;
	priceNative?: string;
	marketCap?: number;
	fdv?: number;
	liquidity?: { usd?: number };
	volume?: { h24?: number };
	txns?: { h24?: { buys?: number; sells?: number } };
	priceChange?: { h24?: number };
};

type DexResponse = { pairs?: DexPair[] | null };

async function rpcCall(to: string, data: string): Promise<string | null> {
	try {
		const res = await fetch(BSC_RPC, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
			next: { revalidate: 300 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { result?: string };
		return json.result && json.result !== "0x" ? json.result : null;
	} catch {
		return null;
	}
}

function decodeUint(hex: string | null): bigint {
	if (!hex) return 0n;
	try {
		return BigInt(hex);
	} catch {
		return 0n;
	}
}

function decodeString(hex: string | null): string | null {
	if (!hex || hex === "0x") return null;
	const raw = hex.slice(2);
	try {
		if (raw.length === 64)
			return (
				(raw.match(/.{1,2}/g) ?? [])
					.map((b) => String.fromCharCode(Number.parseInt(b, 16)))
					.join("")
					.replace(/\0+$/g, "")
					.trim() || null
			);
		const length = Number.parseInt(raw.slice(64, 128), 16);
		const body = raw.slice(128, 128 + length * 2);
		return (
			(body.match(/.{1,2}/g) ?? [])
				.map((b) => String.fromCharCode(Number.parseInt(b, 16)))
				.join("")
				.trim() || null
		);
	} catch {
		return null;
	}
}

async function fetchDexMetrics(contract: string): Promise<Partial<TokenMetrics>> {
	try {
		const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, { next: { revalidate: 60 } });
		if (!res.ok) return {};
		const json = (await res.json()) as DexResponse;
		const pair = (json.pairs ?? [])
			.filter((p) => p.baseToken?.address?.toLowerCase() === contract.toLowerCase())
			.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
		if (!pair) return {};
		const metrics: Partial<TokenMetrics> = {
			priceUsd: Number(pair.priceUsd ?? 0),
			priceBnb: Number(pair.priceNative ?? 0),
			marketCap: pair.marketCap ?? pair.fdv ?? 0,
			liquidityUsd: pair.liquidity?.usd ?? 0,
			volume24h: pair.volume?.h24 ?? 0,
			txs24h: (pair.txns?.h24?.buys ?? 0) + (pair.txns?.h24?.sells ?? 0),
			change24h: pair.priceChange?.h24 ?? 0,
		};
		if (pair.baseToken?.name) metrics.name = pair.baseToken.name;
		if (pair.baseToken?.symbol) metrics.symbol = pair.baseToken.symbol;
		return metrics;
	} catch {
		return {};
	}
}

export async function fetchTokenMetrics(contract: string): Promise<TokenMetrics> {
	const safeContract = contract.trim();
	const [nameHex, symbolHex, decimalsHex, supplyHex, burnedHex, dex] = await Promise.all([
		rpcCall(safeContract, "0x06fdde03"),
		rpcCall(safeContract, "0x95d89b41"),
		rpcCall(safeContract, "0x313ce567"),
		rpcCall(safeContract, "0x18160ddd"),
		rpcCall(safeContract, encodeBalanceOf(BURN_ADDRESS)),
		fetchDexMetrics(safeContract),
	]);
	const decimals = Number(decodeUint(decimalsHex) || 18n);
	const totalSupply = decodeUint(supplyHex);
	const burnedSupply = decodeUint(burnedHex);
	const normalizedSupply = decimals > 0 ? Number(totalSupply) / 10 ** decimals : Number(totalSupply);
	const priceUsd = dex.priceUsd ?? 0;
	return {
		...FALLBACK,
		...dex,
		contract: safeContract,
		name: dex.name || decodeString(nameHex) || FALLBACK.name,
		symbol: dex.symbol || decodeString(symbolHex) || FALLBACK.symbol,
		priceUsd,
		marketCap: dex.marketCap ?? (priceUsd > 0 && Number.isFinite(normalizedSupply) ? normalizedSupply * priceUsd : 0),
		totalSupply,
		burnedSupply,
		decimals,
	};
}
