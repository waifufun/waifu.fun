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
				className={`relative z-20 flex flex-col gap-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pt-24 pb-12 scroll-mt-20 ${
					noTokens ? "min-h-[50vh] justify-center items-center" : ""
				}`}
			>
				<div
					className="pointer-events-none absolute inset-x-0 top-0 h-20"
					style={{
						background:
							"linear-gradient(to bottom, rgba(0,255,135,0.05), rgba(8,8,10,0.18) 30%, rgba(8,8,10,0) 100%)",
					}}
				/>
				{noTokens ? (
					<HomeEmptyState />
				) : (
					<>
						<ExplorerHeader tokenCount={tokens.length} />
						<TokenGrid tokens={tokens} />
					</>
				)}
			</div>
		</div>
	);
}
