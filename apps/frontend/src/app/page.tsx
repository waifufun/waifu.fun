import { GridItem } from "@/components/grid-item";
import { getTokens } from "@/lib/api";
import type { IToken } from "@autofun/types";
import type { Metadata } from "next";
import ListView from "@/components/list-view";

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
		<div className="flex flex-col gap-4">
			<div className="flex flex-col items-center">
				{view === "grid" ? (
					<div className="columns-1 sm:columns-2 md:columns-3 lg:columns-5 gap-4 space-y-4">
						{tokens?.map((token: IToken, idx: number) => (
							<GridItem token={token} key={token.contractAddress} index={idx} />
						))}
					</div>
				) : (
					<ListView tokens={tokens} />
				)}
			</div>
		</div>
	);
}
