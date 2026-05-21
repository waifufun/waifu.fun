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

export function fetchPositions(): Promise<Position[]> {
	// Hardcoded honest single live position (Sol burner BNB).
	// Replace with real RPC + venue API queries when accounts fund.
	return Promise.resolve([
		{
			id: "bnb-spot",
			asset: "BNB",
			venue: "spot · bsc",
			valueUsd: 18.66,
			pnl24h: 0,
			pnl24hPct: 0,
			status: "live",
		},
	]);
}
