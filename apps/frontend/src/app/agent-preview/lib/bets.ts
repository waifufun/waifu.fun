/**
 * Prediction market bets. Polymarket positions go here.
 * Empty until account funded.
 */

export type Bet = {
	id: string;
	title: string;
	market: string; // polymarket / kalshi / etc
	sizeUsd: number;
	pnl24h: number;
	pnl24hPct: number;
	resolveDate?: string; // iso
	status: "open" | "settled";
};

export function fetchBets(): Promise<Bet[]> {
	// No bets until polymarket account funds. Component renders an empty state.
	return Promise.resolve([]);
}
