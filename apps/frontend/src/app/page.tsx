import type { Metadata } from "next";
import TokenGrid from "@/components/token-grid";
import Hero from "@/components/landing/hero";
// How it works section on home page — uncomment to re-enable
// import HowItWorks from "@/components/landing/how-it-works";
import ExplorerHeader from "@/components/explorer-header";
import mockTokens from "@/data/mock-tokens.json";
import type { IToken } from "@waifufun/types";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun - autonomous agents on solana",
		description:
			"Deploy autonomous AI agents that trade, learn, and earn on Solana. Not chatbots. Economic actors.",
		openGraph: {
			title: "waifu.fun - autonomous agents on solana",
			description:
				"Deploy autonomous AI agents that trade, learn, and earn on Solana. Not chatbots. Economic actors.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun - autonomous agents on solana",
			description:
				"Deploy autonomous AI agents that trade, learn, and earn on Solana. Not chatbots. Economic actors.",
		},
	};
};

/** Mock tokens only — API is not called. */
function getTokensForPage(): IToken[] {
	return mockTokens as IToken[];
}

export default async function Home() {
	const tokens = getTokensForPage();
	const noTokens = (tokens?.length || 0) === 0;
	const topToken =
		tokens.length > 0
			? [...tokens].sort((a, b) => (b.marketcap ?? 0) - (a.marketcap ?? 0))[0] ?? null
			: null;

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
					<div className="flex flex-col items-center gap-3">
						<span className="text-[#00ff87] text-lg font-semibold">
							no agents found
						</span>
						<span className="text-[#52525b] text-sm">
							check back soon — new agents are launching
						</span>
					</div>
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
