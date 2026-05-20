import type { Metadata } from "next";
import { TradingDashboard } from "./trading-dashboard";

export const metadata: Metadata = {
	title: "sol · trading",
	description:
		"$WAIFU agent's trading positions across perps, prediction markets, and spot. honest empty state until funded.",
};

export const dynamic = "force-static";

export default function TradingPage() {
	return <TradingDashboard />;
}
