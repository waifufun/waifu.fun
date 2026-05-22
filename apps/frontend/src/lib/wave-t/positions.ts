/**
 * Trading positions across venues. Currently only spot positions
 * via holdings; perps + LP positions will wire when accounts are funded.
 */

export type Position = {
	id: string;
	asset: string;
	venue: string; // spot / hyperliquid / pancake-lp / etc
	valueUsd: number;
	pnl24h: number;
	pnl24hPct: number;
	status: "live" | "pending";
};

/**
 * Return the live positions for the requested agent.
 *
 * Until the `/v2/agents/:address/positions` endpoint lands (P3, cross-venue
 * enumeration via HyperLiquid + PCS LP), this fetcher returns no live rows.
 * The `<ActivePositions>` panel still renders its scheduled-venue list below,
 * which is intentional UX: it labels the venues sol intends to operate.
 *
 * Returning a real, empty list is more honest than the prior hardcoded
 * `$18.66 BNB` fixture, which suggested the agent already had a funded spot
 * position and leaked across every agent page.
 */
export function fetchPositions(): Promise<Position[]> {
	return Promise.resolve([]);
}
