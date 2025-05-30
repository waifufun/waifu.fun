import ChainSelector from "@/components/chain-selector";
import { GridItem } from "@/components/grid-item";
import { getTokens } from "@/lib/api";
import type { IToken } from "@autofun/types";
import Image from "next/image";
import type { Metadata } from "next";
import GridListSelector from "@/components/grid-list-selector";
import ListView from "@/components/list-view";
import FilterSelector from "@/components/filter-selector";

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
	const tokens = await getTokens({ searchParams: currentSearchParams });
	const view = currentSearchParams?.view || "grid";

	return (
		<div className="flex flex-col gap-4">
			<Image
				src="/homepage-hero.svg"
				width={1816}
				height={52}
				unoptimized
				priority
				alt="hero"
				className="mx-auto w-full select-none"
			/>
			<ChainSelector />
			<div className="flex flex-col items-center">
				<div className="flex items-center w-full gap-4">
					<FilterSelector />
					<GridListSelector />
				</div>
				{view === "grid" ? (
					<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
						{tokens?.map((token: IToken) => (
							<GridItem token={token} key={token.contractAddress} />
						))}
					</div>
				) : (
					<ListView tokens={tokens} />
				)}
			</div>
			{/* <RecentTransactions /> */}
		</div>
	);
}
