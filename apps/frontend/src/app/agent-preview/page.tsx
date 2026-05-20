import type { Metadata } from "next";

import { Dashboard } from "./dashboard";
import { buildActivity } from "./lib/activity";
import { fetchCandleSeries } from "./lib/candles";
import { fetchShipLog } from "./lib/github";
import { fetchHoldings } from "./lib/holdings";
import { fetchMarkets } from "./lib/markets";
import { fetchTokenMetrics } from "./lib/token";
import { fetchTweets } from "./lib/voice";

// placeholder until $WAIFU launches: render the live ElizaOS token on BSC
// (real DEX pair, real volume, real OHLC). Set NEXT_PUBLIC_AGENT_PREVIEW_TOKEN_ADDRESS
// to override per agent.
const DEFAULT_TOKEN_ADDRESS = "0xea17df5cf6d172224892b5477a16acb111182478";

export const metadata: Metadata = {
	title: "sol · $WAIFU terminal",
	description: "Agent token page with price chart, swap panel, revenue streams, and live activity.",
};

export const dynamic = "force-static";

export default async function AgentPreviewPage() {
	const tokenAddress = process.env.NEXT_PUBLIC_AGENT_PREVIEW_TOKEN_ADDRESS?.trim() || DEFAULT_TOKEN_ADDRESS;
	const [holdings, ship, tweets, markets, token, initialCandles] = await Promise.all([
		fetchHoldings(),
		fetchShipLog(),
		fetchTweets(),
		fetchMarkets(),
		fetchTokenMetrics(tokenAddress),
		fetchCandleSeries(tokenAddress, "1h"),
	]);
	const activity = buildActivity({ prs: ship.items, tweets, markets });
	return (
		<Dashboard
			activity={activity}
			holdings={holdings}
			initialCandles={initialCandles}
			ship={ship}
			token={token}
			tokenAddress={tokenAddress}
		/>
	);
}
