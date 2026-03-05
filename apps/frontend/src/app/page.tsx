import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";
import mockTokens from "@/data/mock-tokens.json";
import type { IToken } from "@waifufun/types";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun - Fair Launchpad & Trading Platform",
		description:
			"Launch your token fairly on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on waifu.fun.",
		openGraph: {
			title: "waifu.fun - Fair Launchpad & Trading Platform",
			description:
				"Launch your token fairly on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on waifu.fun.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun - Fair Launchpad & Trading Platform",
			description:
				"Launch your token fairly on Solana, Ethereum, and Base. Trade tokens with real-time analytics and comprehensive market data on waifu.fun.",
		},
	};
};

/** Mock tokens only — API is not called. */
function getTokensForPage(): IToken[] {
	return mockTokens as IToken[];
}

export default async function Home({
	searchParams,
}: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
	const currentSearchParams = await searchParams;
	const tokens = getTokensForPage();
	const view = currentSearchParams?.view || "grid";
	const noTokens = (tokens?.length || 0) === 0;
	return (
		<div className={`flex flex-col gap-4 w-full ${noTokens ? "h-screen justify-center items-center" : ""}`}>
			{noTokens ? (
				<h1 className="text-[#03FF23] text-lg font-semibold uppercase">No tokens found</h1>
			) : view === "grid" ? (
				<TokenGrid tokens={tokens} />
			) : (
				<ListView tokens={tokens} />
			)}
		</div>
	);
}
