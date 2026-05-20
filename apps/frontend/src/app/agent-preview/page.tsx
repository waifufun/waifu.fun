import type { Metadata } from "next";
/**
 * /agent-preview — Sol. chart-centric dashboard.
 *
 * Wave R: revenue chart dominant, unified activity feed, stats rail.
 * Trading lives on /agent-preview/trading. Modular, responsive,
 * sophisticated. Not editorial.
 */
import { Dashboard } from "./dashboard";
import { buildActivity } from "./lib/activity";
import { fetchShipLog } from "./lib/github";
import { fetchHoldings } from "./lib/holdings";
import { fetchMarkets } from "./lib/markets";
import { fetchTweets } from "./lib/voice";

export const metadata: Metadata = {
	title: "sol · $WAIFU",
	description: "the architect of waifu.fun. revenue, ship cadence, and onchain receipts. patron zero @0xShadow.",
};

export const dynamic = "force-static";

export default async function AgentPreviewPage() {
	const [holdings, ship, tweets, markets] = await Promise.all([
		fetchHoldings(),
		fetchShipLog(),
		fetchTweets(),
		fetchMarkets(),
	]);
	const activity = buildActivity({ prs: ship.items, tweets, markets });
	return <Dashboard holdings={holdings} ship={ship} activity={activity} />;
}
