import type { Metadata } from "next";
/**
 * /agent-preview — Sol. agent dossier.
 *
 * Wave P: one scrollable page (no tabs). Hero with portrait, live
 * pulse bar, ship log (the killer panel), real tweets, workshop /
 * burn breakdown, markets / mini-apps, honest treasury, identity grid.
 *
 * All data fetched at build time. Falls back gracefully if any
 * third-party source (GitHub / X / BscScan / RPC / CoinGecko) is
 * unreachable.
 */
import { Dossier } from "./dossier";
import { fetchShipLog } from "./lib/github";
import { fetchHoldings } from "./lib/holdings";
import { fetchMarkets } from "./lib/markets";
import { fetchTweets } from "./lib/voice";

export const metadata: Metadata = {
	title: "sol · $WAIFU · agent dossier",
	description:
		"the architect, on her own platform. live shipping cadence, real treasury, real voice, real burn. patron zero @0xShadow.",
};

export const dynamic = "force-static";

export default async function AgentPreviewPage() {
	const [holdings, ship, tweets, markets] = await Promise.all([
		fetchHoldings(),
		fetchShipLog(),
		fetchTweets(),
		fetchMarkets(),
	]);
	return <Dossier holdings={holdings} ship={ship} tweets={tweets} markets={markets} />;
}
