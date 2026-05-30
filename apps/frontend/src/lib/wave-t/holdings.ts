/**
 * Holdings types + the canonical `/v2/agents/:address/holdings` mapper.
 *
 * The agent page renders holdings strictly from the keyed aggregator
 * (`fetchAgentHoldingsSnapshot` in ./agent-holdings) mapped through
 * `holdingsSnapshotFromApi` below. There is intentionally NO non-keyed
 * native-balance fetch in this module: reading a shared / hardcoded
 * burner address would leak the platform's (or another agent's) money
 * onto whichever agent page happened to render it. That fallback was
 * removed; an absent snapshot degrades to an honest empty allocation
 * at the call site instead.
 */

import { type AgentHoldingsSnapshot, holdingsRowsOf } from "./agent-holdings";

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
