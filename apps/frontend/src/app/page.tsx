import ChainSelector from "@/components/chain-selector";
import { GridItem } from "@/components/grid-item";
import { Button } from "@/components/ui/button";
import { getTokens } from "@/lib/api";
import type { IToken } from "@autofun/types";
import { Grid, List } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
	const data = await getTokens({ searchParams: await searchParams });
	const tokens = data?.docs;

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
				<div className="ml-auto flex items-center gap-2">
					<Button variant="secondary" size="icon">
						<List />
					</Button>
					<Button variant="outline" size="icon">
						<Grid />
					</Button>
				</div>
			</div>
			<div className="grid grid-cols-6 gap-4">
				{tokens?.map((token: IToken) => (
					<GridItem token={token} key={token.contractAddress} />
				))}
			</div>
			{/* <RecentTransactions /> */}
		</div>
	);
}
