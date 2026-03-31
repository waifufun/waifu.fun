import { getTokens } from "@/lib/api";
import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun - the agent token launchpad",
		description:
			"Launch your waifu token on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on waifu.fun.",
		openGraph: {
			title: "waifu.fun - the agent token launchpad",
			description:
				"Launch your waifu token on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on waifu.fun.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun - the agent token launchpad",
			description:
				"Launch your waifu token on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on waifu.fun.",
		},
	};
};

export default async function Home({
	searchParams,
}: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
	const currentSearchParams = await searchParams;
	const tokens = await getTokens({ searchParams: currentSearchParams });
	const view = currentSearchParams?.view || "grid";
	const noTokens = (tokens?.length || 0) === 0;
	return (
		<div className={`flex flex-col gap-4 container ${noTokens ? "h-screen justify-center items-center" : ""}`}>
			<div className="flex flex-col items-center w-full">
				{noTokens ? (
					<h1 className="text-waifu-green text-lg font-semibold uppercase">No tokens found</h1>
				) : view === "grid" ? (
					<TokenGrid tokens={tokens} />
				) : (
					<ListView tokens={tokens} />
				)}
			</div>
		</div>
	);
}
