/**
 * Holdings query: live multi-chain balances + USD valuation.
 *
 * Build-time fetch (page is static export). Each request hits public RPCs +
 * CoinGecko. All errors degrade to "0" gracefully so the page never breaks.
 *
 * Source of truth: \`SOL_BURNER\` is the same address across every EVM chain.
 */

export const SOL_BURNER = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";

export type ChainKey = "bsc" | "eth" | "arb" | "base" | "op";

export interface ChainHolding {
	chain: ChainKey;
	chainName: string;
	asset: string;
	balance: number;
	priceUsd: number;
	valueUsd: number;
}

interface ChainConfig {
	key: ChainKey;
	name: string;
	rpc: string;
	asset: string;
	priceId: string; // coingecko id
}

const CHAINS: ChainConfig[] = [
	{ key: "bsc", name: "BSC", rpc: "https://bsc-mainnet.public.blastapi.io", asset: "BNB", priceId: "binancecoin" },
	{ key: "eth", name: "Ethereum", rpc: "https://eth.llamarpc.com", asset: "ETH", priceId: "ethereum" },
	{ key: "arb", name: "Arbitrum", rpc: "https://arb1.arbitrum.io/rpc", asset: "ETH", priceId: "ethereum" },
	{ key: "base", name: "Base", rpc: "https://base.llamarpc.com", asset: "ETH", priceId: "ethereum" },
	{ key: "op", name: "Optimism", rpc: "https://mainnet.optimism.io", asset: "ETH", priceId: "ethereum" },
];

async function rpcBalance(rpc: string, address: string): Promise<number> {
	try {
		const res = await fetch(rpc, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
			next: { revalidate: 300 },
		});
		if (!res.ok) return 0;
		const j = (await res.json()) as { result?: string };
		if (!j.result) return 0;
		return Number.parseInt(j.result, 16) / 1e18;
	} catch {
		return 0;
	}
}

async function priceUsd(ids: string[]): Promise<Record<string, number>> {
	try {
		const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
		const res = await fetch(url, { next: { revalidate: 300 } });
		if (!res.ok) return {};
		const j = (await res.json()) as Record<string, { usd: number }>;
		const out: Record<string, number> = {};
		for (const id of ids) out[id] = j[id]?.usd ?? 0;
		return out;
	} catch {
		return {};
	}
}

export interface HoldingsSnapshot {
	holdings: ChainHolding[];
	navUsd: number;
	fetchedAt: number;
}

export async function fetchHoldings(): Promise<HoldingsSnapshot> {
	const uniquePriceIds = Array.from(new Set(CHAINS.map((c) => c.priceId)));
	const [prices, ...balances] = await Promise.all([
		priceUsd(uniquePriceIds),
		...CHAINS.map((c) => rpcBalance(c.rpc, SOL_BURNER)),
	]);

	const holdings: ChainHolding[] = CHAINS.map((c, i) => {
		const bal = balances[i] ?? 0;
		const px = prices[c.priceId] ?? 0;
		return {
			chain: c.key,
			chainName: c.name,
			asset: c.asset,
			balance: bal,
			priceUsd: px,
			valueUsd: bal * px,
		};
	});

	const navUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);
	return { holdings, navUsd, fetchedAt: Date.now() };
}
