/**
 * Watchlist data lib for the sidebar's WATCHLIST section.
 *
 * Currently mocked. The shape is ready for a live CoinGecko (or any
 * other) feed - swap out the body of fetchWatchlist() without
 * touching the sidebar UI. Prices use USD, 24h change is a signed
 * percentage (e.g., 1.8 means +1.8%, -0.4 means -0.4%).
 */

export type WatchlistEntry = {
	symbol: string;
	name: string;
	iconHref: string;
	priceUsd: number;
	change24hPct: number;
};

const MOCK_WATCHLIST: WatchlistEntry[] = [
	{ symbol: "BNB", name: "BNB", iconHref: "/chain-icons/bnb.svg", priceUsd: 612.4, change24hPct: 1.8 },
	{ symbol: "SOL", name: "Solana", iconHref: "/chain-icons/solana.svg", priceUsd: 168.2, change24hPct: -0.4 },
	{ symbol: "BTCB", name: "BTCB", iconHref: "/chain-icons/bsc.svg", priceUsd: 67432, change24hPct: 0.6 },
	{ symbol: "ETH", name: "ETH", iconHref: "/chain-icons/ethereum.svg", priceUsd: 3284, change24hPct: -1.2 },
];

export async function fetchWatchlist(): Promise<WatchlistEntry[]> {
	// Live wiring (commented for now): a CoinGecko free-tier hit would
	// look like fetch("https://api.coingecko.com/api/v3/simple/price?ids=...&vs_currencies=usd&include_24hr_change=true",
	// { next: { revalidate: 300 } }). For Wave U we ship mocked while the
	// rest of the shell stabilises; the entry shape is already correct
	// so the swap is a one-file change.
	return MOCK_WATCHLIST;
}
