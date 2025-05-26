import ChainSelector from "@/components/chain-selector";
import { GridItem } from "@/components/grid-item";
import { getTokens } from "@/lib/api";
import type { IToken } from "@autofun/types";
import Image from "next/image";
import type { Metadata } from "next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GridListSelector from "@/components/grid-list-selector";
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
	const data = await getTokens({ searchParams: currentSearchParams });
	const tokens = data?.docs;
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
			<div className="flex items-center w-full gap-4">
				<Tabs defaultValue="new" className="w-full">
					<TabsList className="grid w-full grid-cols-5">
						<TabsTrigger value="new">New</TabsTrigger>
						<TabsTrigger value="trending">Trending</TabsTrigger>
						<TabsTrigger value="featured">Featured</TabsTrigger>
						<TabsTrigger value="marketcap">Marketcap</TabsTrigger>
						<TabsTrigger value="about-to-bond">About to Bond</TabsTrigger>
					</TabsList>
				</Tabs>
				<GridListSelector />
			</div>
			{view === "grid" ? (
				<div className="grid grid-cols-6 gap-4">
					{tokens?.map((token: IToken) => (
						<GridItem token={token} key={token.contractAddress} />
					))}
				</div>
			) : (
				<ListView tokens={tokens} />
			)}
			{/* <RecentTransactions /> */}
		</div>
	);
}
