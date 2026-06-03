/**
 * Holdings types + the mapper from the keyed /v2/agents/:address/holdings
 * snapshot into the page's HoldingsSnapshot shape.
 *
 * NOTE: the legacy non-keyed multi-chain burner fetch (fetchHoldings +
 * SOL_BURNER) was REMOVED. It read a single hardcoded platform burner
 * address across chains and was used as a fallback on the agent page, which
 * could render the platform's balances on an arbitrary agent's page. The
 * agent page now uses only the keyed aggregator and falls back to an honest
 * empty snapshot.
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
	wallets?: HoldingWallet[];
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

/**
 * Per-wallet contribution to an aggregated (chain, asset) row. `address`
 * and `chain` are additive (used by the wallet-ledger cockpit view); the
 * legacy donut drilldown only reads `label / role / balance / valueUsd`.
 */
export interface HoldingWallet {
	label: string;
	role: string;
	balance: number;
	valueUsd: number;
	address?: string;
	chain?: ChainKey;
}

/**
 * A single wallet (by on-chain address) rolled across every asset it
 * holds. Drives the wallet-ledger cockpit: one row per real wallet,
 * grouped under its role, with its chain + venue context intact.
 */
export interface WalletLine {
	address: string;
	label: string;
	role: string;
	chain: ChainKey;
	chainName: string;
	/** Venue when the wallet custodies at a venue distinct from its chain. */
	venue?: string;
	valueUsd: number;
	/** Top assets in this wallet, desc by usd, for an inline composition bar. */
	assets: { asset: string; valueUsd: number; balance: number }[];
}

/**
 * A role bucket (agent-safe, agent-hot, patron, venue-bridge, ...) with
 * its total value and the wallets that compose it. The cockpit groups
 * the ledger by role so a viewer reads "where is the money + what's it
 * doing" top-down.
 */
export interface RoleLine {
	role: string;
	valueUsd: number;
	wallets: WalletLine[];
}

export interface HoldingsSnapshot {
	holdings: ChainHolding[];
	navUsd: number;
	fetchedAt: number;
	/**
	 * Per-wallet ledger grouped by role, rebuilt straight from the raw API
	 * rows. Empty for the legacy single-wallet stub. Additive: existing
	 * consumers (the donut) ignore it.
	 */
	roles?: RoleLine[];
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
		const walletEntry: HoldingWallet = {
			label: h.walletLabel || h.walletRole,
			role: h.walletRole,
			balance: h.balance,
			valueUsd: h.valueUsd,
			...(h.walletAddress ? { address: h.walletAddress } : {}),
			chain,
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
		roles: rolesLedgerFromApi(snapshot, chainName, chainKeyMap, venueDisplay),
	};
}

/**
 * Build the role-grouped wallet ledger straight from the raw API rows.
 *
 * One `WalletLine` per real on-chain wallet (keyed by walletId, falling
 * back to address), carrying its chain + venue and a per-asset composition
 * for the inline bar. Wallets are then grouped under their role bucket and
 * both levels are sorted desc by usd value so the heaviest role + wallet
 * lead. Only priced spot rows feed the ledger (perps live in the positions
 * panel); a wallet with only unpriced perps simply does not appear here.
 */
function rolesLedgerFromApi(
	snapshot: AgentHoldingsSnapshot,
	chainName: Record<string, string>,
	chainKeyMap: Record<string, ChainKey>,
	venueDisplay: Record<string, string>,
): RoleLine[] {
	const walletMap = new Map<string, WalletLine>();
	for (const h of holdingsRowsOf(snapshot)) {
		if (h.valueUsd == null || h.valueUsd <= 0) continue;
		const chain = chainKeyMap[h.chain.toLowerCase()] ?? "bsc";
		const walletKey = h.walletId || h.walletAddress || `${h.walletRole}:${chain}`;
		const venueKey = (h.venue || "").toLowerCase();
		const venueLabel = venueKey ? venueDisplay[venueKey] : undefined;
		const existing = walletMap.get(walletKey);
		if (existing) {
			existing.valueUsd += h.valueUsd;
			const asset = existing.assets.find((a) => a.asset === h.asset);
			if (asset) {
				asset.valueUsd += h.valueUsd;
				asset.balance += h.balance;
			} else {
				existing.assets.push({ asset: h.asset, valueUsd: h.valueUsd, balance: h.balance });
			}
		} else {
			walletMap.set(walletKey, {
				address: h.walletAddress || "",
				label: h.walletLabel || h.walletRole,
				role: h.walletRole,
				chain,
				chainName: chainName[h.chain.toLowerCase()] ?? h.chain.toUpperCase(),
				...(venueLabel ? { venue: venueLabel } : {}),
				valueUsd: h.valueUsd,
				assets: [{ asset: h.asset, valueUsd: h.valueUsd, balance: h.balance }],
			});
		}
	}

	const roleMap = new Map<string, RoleLine>();
	for (const w of walletMap.values()) {
		w.assets.sort((a, b) => b.valueUsd - a.valueUsd);
		const role = roleMap.get(w.role);
		if (role) {
			role.valueUsd += w.valueUsd;
			role.wallets.push(w);
		} else {
			roleMap.set(w.role, { role: w.role, valueUsd: w.valueUsd, wallets: [w] });
		}
	}

	const roles = Array.from(roleMap.values());
	for (const r of roles) r.wallets.sort((a, b) => b.valueUsd - a.valueUsd);
	roles.sort((a, b) => b.valueUsd - a.valueUsd);
	return roles;
}
