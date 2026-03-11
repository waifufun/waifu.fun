import type { Metadata } from "next";
import TokenGrid from "@/components/token-grid";
import Hero from "@/components/landing/hero";
import HomeEmptyState from "@/components/home-empty-state";
// How it works section on home page — uncomment to re-enable
// import HowItWorks from "@/components/landing/how-it-works";
import ExplorerHeader from "@/components/explorer-header";
import { getTokens } from "@/lib/api";
import type { IToken } from "@waifufun/types";

const MILADY_CONTRACT_ADDRESS = "0xc20e45e49e0e79f0fc81e71f05fd2772d6587777";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun - autonomous agent launchpad",
		description: "deploy autonomous AI agents that trade, learn, and earn on-chain. not chatbots. economic actors.",
		openGraph: {
			title: "waifu.fun - autonomous agent launchpad",
			description: "deploy autonomous AI agents that trade, learn, and earn on-chain. not chatbots. economic actors.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun - autonomous agent launchpad",
			description: "deploy autonomous AI agents that trade, learn, and earn on-chain. not chatbots. economic actors.",
		},
	};
};

export default async function Home() {
	let tokens: IToken[] = [];
	try {
		tokens = await getTokens({ searchParams: { featured: "true", limit: 20 } });
	} catch (e) {
		console.error("Failed to fetch featured tokens:", e);
	}
	const noTokens = (tokens?.length || 0) === 0;
	const topToken =
		tokens.find((token) => token.contractAddress?.toLowerCase() === MILADY_CONTRACT_ADDRESS.toLowerCase()) ??
		(tokens.length > 0 ? ([...tokens].sort((a, b) => (b.marketcap ?? 0) - (a.marketcap ?? 0))[0] ?? null) : null);

	return (
		<div className="flex flex-col w-full">
			<Hero token={topToken} />
			{/* How it works section — uncomment to re-enable */}
			{/* <HowItWorks /> */}

			<div
				id="explore"
				className={`flex flex-col gap-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 scroll-mt-20 ${
					noTokens ? "min-h-[50vh] justify-center items-center" : ""
				}`}
			>
				{noTokens ? (
					<HomeEmptyState />
				) : (
					<>
						<ExplorerHeader />
						<TokenGrid tokens={tokens} />
					</>
				)}
			</div>
		</div>
	);
}
