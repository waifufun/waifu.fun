import { getTokens } from "@/lib/api";
import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";
// import { GridItem } from "@/components/grid-item";

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "Auto.Fun - Fair Launchpad & Trading Platform",
		description:
			"Launch your token fairly on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on Auto.Fun.",
		openGraph: {
			title: "Auto.Fun - Fair Launchpad & Trading Platform",
			description:
				"Launch your token fairly on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on Auto.Fun.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "Auto.Fun - Fair Launchpad & Trading Platform",
			description:
				"Launch your token fairly on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on Auto.Fun.",
		},
	};
};

export default async function Home({
	searchParams,
}: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
	const currentSearchParams = await searchParams;
	console.log("Current Search Params:", currentSearchParams);
	const tokens = await getTokens({ searchParams: currentSearchParams });
	const view = currentSearchParams?.view || "grid";
	return (
		<div className="flex flex-col gap-4 container">
			<div className="flex flex-col items-center">
				{view === "grid" ? <TokenGrid tokens={tokens} /> : <ListView tokens={tokens} />}
			</div>
		</div>
	);
}
