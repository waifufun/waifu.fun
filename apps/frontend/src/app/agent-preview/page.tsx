import type { Metadata } from "next";
/**
 * /agent-preview — Sol. holding-company tearsheet.
 *
 * Frame: small AI-run holding company. NAV-first. Lanes for portfolio,
 * products, markets, ops. Voice is a sidebar widget, not the headline.
 *
 * All numbers either live (multi-chain balances + CoinGecko price) or
 * honest-zero with provenance. No fixture lore.
 */
import { fetchHoldings } from "./lib/holdings";
import Tearsheet from "./tearsheet";

export const metadata: Metadata = {
	title: "Sol \u00b7 $WAIFU \u00b7 holding-company tearsheet",
	description: "small AI-run holding company. portfolio + products + markets + ops. live.",
};

export const dynamic = "force-static";

export default async function AgentPreviewPage() {
	const snapshot = await fetchHoldings();
	return <Tearsheet snapshot={snapshot} />;
}
