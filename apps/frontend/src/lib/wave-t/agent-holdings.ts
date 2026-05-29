/**
 * Server-safe fetcher for `/v2/agents/:address/holdings`.
 *
 * Returns a normalized NAV snapshot when the endpoint is live, and `null`
 * when the endpoint is not yet deployed (404) or any other failure. The
 * caller is expected to render an honest empty / fall back to a partial
 * source when the result is null - never to invent data.
 *
 * The /holdings endpoint ships in PR #712 (NAV aggregator). Until it is
 * merged + deployed in prod, every call returns null and the consumer
 * falls back to its previous best-effort source (AgentSafe BNB balance,
 * or the legacy multi-chain burner stub).
 *
 * Why this lives in `lib/wave-t/` instead of `lib/api/`: the canonical
 * `apiFetch` wrapper reads a Steward JWT from a module global that is
 * only set client-side, and uses cookies via `credentials: include`.
 * The agent page is server-rendered for static export, so it cannot use
 * `apiFetch`. This file mirrors the wire format but uses raw `fetch`
 * with revalidation, like the other server-side wave-t fetchers in this
 * directory.
 */

import type { HyperliquidPosition } from "@/lib/hooks/use-hyperliquid-positions";

export type AgentHoldingsHolding = {
	walletId: string;
	walletAddress: string;
	walletLabel: string;
	walletRole: "agent-safe" | "agent-hot" | "patron" | "venue-bridge" | string;
	chain: string;
	asset: string;
	contract: string | null;
	balance: number;
	priceUsd: number | null;
	valueUsd: number | null;
	priced: boolean;
	kind?: "spot" | "perp" | "lp" | string;
	/**
	 * Venue this position is custodied / cleared at, when distinct from
	 * the EVM chain. Example: USDC sitting in the Hyperliquid clearinghouse
	 * is held in a wallet on `chain: "arb"` but its purchasing power lives
	 * inside Hyperliquid, not on Arbitrum. The API sets `venue:
	 * "hyperliquid"` on those rows so the FE can label the chain column
	 * with the venue, not the bridge chain.
	 */
	venue?: string;
};

/**
 * Raw hyperliquid perp position as it lands in the /holdings snapshot's
 * `perpsPositions[]` array. Numbers arrive as strings on the wire.
 */
export type AgentPerpPosition = {
	venue: string;
	asset: string;
	side: "long" | "short" | string;
	size: string | number;
	entryPrice: string | number | null;
	markPrice: string | number | null;
	notionalUsd: string | number | null;
	leverage: string | number | null;
	unrealizedPnlUsd: string | number | null;
	liquidationPrice: string | number | null;
};

export type AgentHoldingsSnapshot = {
	agentTokenAddress: string;
	generatedAt: number;
	navUsd: number;
	unpriced: { count: number; assets: string[] };
	byChain: Record<string, number>;
	byWallet: Record<string, number>;
	byRole: Record<string, number>;
	holdings: AgentHoldingsHolding[];
	/**
	 * Newer NAV-aggregator shape names the spot rows `tokenHoldings` and
	 * splits perps into `perpsPositions`. Older callers read `holdings`.
	 * Consumers should normalize via `holdingsRowsOf()`. Optional because
	 * the legacy shape only carries `holdings`.
	 */
	tokenHoldings?: AgentHoldingsHolding[];
	stale: { source: string; reason: string }[];
	/**
	 * Open perp positions across venues (hyperliquid today). Present on the
	 * live snapshot; absent on legacy / spot-only agents. The ActivePositions
	 * panel reads this directly instead of the (non-existent)
	 * /hyperliquid/positions endpoint.
	 */
	perpsPositions?: AgentPerpPosition[];
};

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

/**
 * Spot holdings rows, tolerant of both API shapes. The NAV aggregator
 * emits `tokenHoldings`; the legacy aggregator emitted `holdings`. Returns
 * an empty array when neither is present so consumers never iterate undefined.
 */
export function holdingsRowsOf(snapshot: AgentHoldingsSnapshot | null | undefined): AgentHoldingsHolding[] {
	if (!snapshot) return [];
	if (Array.isArray(snapshot.holdings)) return snapshot.holdings;
	if (Array.isArray(snapshot.tokenHoldings)) return snapshot.tokenHoldings;
	return [];
}

function num(value: string | number | null | undefined): number {
	if (value === null || value === undefined) return 0;
	const n = typeof value === "number" ? value : Number.parseFloat(value);
	return Number.isFinite(n) ? n : 0;
}

function optNum(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : Number.parseFloat(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * Map the /holdings snapshot's `perpsPositions[]` into the
 * `HyperliquidPosition` shape the ActivePositions table renders. Derives
 * unrealized pnl % from entry/mark + size + leverage when the API does not
 * carry it directly. Data-driven: returns [] when no perps are present.
 */
export function perpPositionsFromSnapshot(snapshot: AgentHoldingsSnapshot | null | undefined): HyperliquidPosition[] {
	const raw = snapshot?.perpsPositions;
	if (!Array.isArray(raw) || raw.length === 0) return [];
	return raw.map((p) => {
		const size = num(p.size);
		const entryPrice = optNum(p.entryPrice);
		const markPrice = optNum(p.markPrice);
		const notionalUsd = num(p.notionalUsd);
		const leverage = optNum(p.leverage);
		const unrealizedPnlUsd = num(p.unrealizedPnlUsd);
		const side: "long" | "short" = p.side === "short" ? "short" : "long";
		// Margin = notional / leverage. ROE = pnl / margin. Both derived when
		// the venue supplies leverage; null otherwise so the cell shows a middot.
		const marginUsd = leverage && leverage > 0 ? notionalUsd / leverage : 0;
		const unrealizedPnlPct = marginUsd > 0 ? (unrealizedPnlUsd / marginUsd) * 100 : null;
		return {
			coin: p.asset.toUpperCase(),
			side,
			size,
			entryPrice,
			currentPrice: markPrice,
			leverage,
			notionalUsd,
			marginUsd,
			liquidationPrice: optNum(p.liquidationPrice),
			unrealizedPnlUsd,
			unrealizedPnlPct,
			roe: unrealizedPnlPct,
		};
	});
}

/**
 * Fetch the aggregated holdings snapshot for an agent.
 *
 * Returns null on any non-200, including the 404 we serve today before
 * #712 lands in prod. Network failures degrade to null so the agent
 * page never throws.
 */
export async function fetchAgentHoldingsSnapshot(address: string): Promise<AgentHoldingsSnapshot | null> {
	const base = serverApiBase();
	try {
		const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/holdings`, {
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as unknown;
		if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
			return (json as { data: AgentHoldingsSnapshot }).data ?? null;
		}
		return json as AgentHoldingsSnapshot;
	} catch {
		return null;
	}
}
