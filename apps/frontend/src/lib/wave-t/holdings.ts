/**
 * Holdings query: live multi-chain balances + USD valuation.
 *
 * Build-time fetch (page is static export). Each request hits public RPCs +
 * CoinGecko. All errors degrade to "0" gracefully so the page never breaks.
 *
 * Source of truth: \`SOL_BURNER\` is the same address across every EVM chain.
 */

import { type AgentHoldingsSnapshot, holdingsRowsOf } from "./agent-holdings";

export const SOL_BURNER = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";

export type ChainKey = "bsc" | "eth" | "arb" | "base" | "op";

export interface ChainHolding {
	chain: ChainKey;
	chainName: string;
	asset: string;
	/**
	 * Token contract address when the asset is an ERC20; null for native
	 * assets (BNB, ETH). Used as the disambiguating key when two ERC20s
	 * share a symbol (USDC.e vs USDC, wrapped vs bridged, etc).
	 */
	contract?: string | null;
	balance: number;
	priceUsd: number;
	valueUsd: number;
	/**
	 * Wallet-level breakdown of this aggregated row. Populated when the
	 * snapshot was built from `/v2/agents/:address/holdings` (multi-wallet)
	 * and left empty for the legacy single-wallet burner stub. Useful for
	 * tooltips / drilldowns.
	 */
	wallets?: { label: string; role: string; balance: number; valueUsd: number }[];
	/**
	 * Display label for the chain column when the asset is custodied at a
	 * venue distinct from the EVM chain it bridges through. Example: USDC
	 * in the Hyperliquid clearinghouse rides through an Arbitrum deposit
	 * wallet but its purchasing power is on Hyperliquid, so we surface
	 * "HYPERLIQUID" instead of "ARBITRUM". When undefined, consumers fall
	 * back to `chainName`.
	 */
	displayVenue?: string;
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

/**
 * Map the canonical `/v2/agents/:address/holdings` snapshot into the
 * legacy `HoldingsSnapshot` shape consumed by `<HoldingsAllocation>`.
 *
 * We collapse rows by (chain, contract || asset) so the donut renders
 * one slice per unique on-chain asset regardless of how many wallets
 * contributed. BNB held in agent-safe + agent-hot + patron on BSC all
 * fold into a single row; USDC.e and USDC on the same chain stay
 * separate because their contracts differ. Only priced rows
 * (valueUsd != null) are projected; unpriced rows stay counted in
 * `navUsd` but don't get their own slice.
 *
 * Per-wallet contributions are preserved on the row as `wallets[]` so
 * consumers can render a drilldown without re-fetching.
 */
export function holdingsSnapshotFromApi(snapshot: AgentHoldingsSnapshot): HoldingsSnapshot {
	const chainName: Record<string, string> = {
		bsc: "BSC",
		eth: "Ethereum",
		ethereum: "Ethereum",
		arb: "Arbitrum",
		arbitrum: "Arbitrum",
		base: "Base",
		op: "Optimism",
		optimism: "Optimism",
		polygon: "Polygon",
		solana: "Solana",
	};
	const chainKeyMap: Record<string, ChainKey> = {
		bsc: "bsc",
		eth: "eth",
		ethereum: "eth",
		arb: "arb",
		arbitrum: "arb",
		base: "base",
		op: "op",
		optimism: "op",
	};

	// Friendly display labels for venues that custody assets distinct
	// from the bridge chain they ride through. Keyed by the lowercase
	// `venue` field on the API row.
	const venueDisplay: Record<string, string> = {
		hyperliquid: "Hyperliquid",
	};

	const grouped = new Map<string, ChainHolding>();
	// Track the set of distinct venues contributing to each bucket. When
	// every contributor shares a single non-empty venue, we surface that
	// venue as the displayed chain. Mixed buckets (e.g. half on chain,
	// half bridged to a venue) keep the EVM chain name, since collapsing
	// would be misleading.
	const bucketVenues = new Map<string, Set<string>>();
	for (const h of holdingsRowsOf(snapshot)) {
		if (h.valueUsd == null) continue;
		const chain = chainKeyMap[h.chain.toLowerCase()] ?? "bsc";
		// Group by (chain, contract). Falls back to symbol when contract is
		// null (native assets) so BNB / ETH each collapse into one row per
		// chain. Lowercase the contract so checksummed and non-checksummed
		// addresses agree on the same bucket.
		const contractKey = h.contract ? h.contract.toLowerCase() : h.asset;
		const key = `${chain}:${contractKey}`;
		const walletEntry = {
			label: h.walletLabel || h.walletRole,
			role: h.walletRole,
			balance: h.balance,
			valueUsd: h.valueUsd,
		};
		const venueKey = (h.venue || "").toLowerCase();
		const venues = bucketVenues.get(key) ?? new Set<string>();
		venues.add(venueKey);
		bucketVenues.set(key, venues);
		const existing = grouped.get(key);
		if (existing) {
			existing.balance += h.balance;
			existing.valueUsd += h.valueUsd;
			existing.wallets?.push(walletEntry);
		} else {
			grouped.set(key, {
				chain,
				chainName: chainName[h.chain.toLowerCase()] ?? h.chain.toUpperCase(),
				asset: h.asset,
				contract: h.contract,
				balance: h.balance,
				priceUsd: h.priceUsd ?? 0,
				valueUsd: h.valueUsd,
				wallets: [walletEntry],
			});
		}
	}

	// Resolve displayVenue per bucket: only when every contributing row
	// shares the same non-empty venue. Mixed venues fall back to the
	// EVM chain label.
	for (const [key, row] of grouped) {
		const venues = bucketVenues.get(key);
		if (!venues || venues.size !== 1) continue;
		const [only] = Array.from(venues);
		if (!only) continue;
		const label = venueDisplay[only];
		if (label) row.displayVenue = label;
	}

	// Sort wallet breakdowns desc by usd contribution for stable rendering.
	for (const row of grouped.values()) {
		row.wallets?.sort((a, b) => b.valueUsd - a.valueUsd);
	}

	return {
		holdings: Array.from(grouped.values()),
		navUsd: snapshot.navUsd,
		fetchedAt: snapshot.generatedAt > 0 ? snapshot.generatedAt : Date.now(),
	};
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
