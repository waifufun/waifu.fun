import type { Metadata } from "next";
import TokenGrid from "@/components/token-grid";
import Hero from "@/components/landing/hero";
import WaifuHub from "@/components/landing/waifu-hub";
import HomeEmptyState from "@/components/home-empty-state";
import ExplorerHeader from "@/components/explorer-header";
import { getTokens } from "@/lib/api";
import type { IToken } from "@waifufun/types";

const MILADY_CONTRACT_ADDRESS = "0xc20e45e49e0e79f0fc81e71f05fd2772d6587777";
const ELIZA_CONTRACT_ADDRESS = "0xea17Df5Cf6D172224892B5477A16ACb111182478";
const ELIZA_HOMEPAGE_IMAGE = "/waifus/eliza-hero.png";

const CURATED_HOME_CONTRACTS = [MILADY_CONTRACT_ADDRESS.toLowerCase(), ELIZA_CONTRACT_ADDRESS.toLowerCase()];
const SOCIAL_PREVIEW = "/brand/previews/waifu-fun-og.png";

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
			images: [
				{
					url: SOCIAL_PREVIEW,
					width: 2048,
					height: 1073,
					alt: "waifu.fun - agents that trade to survive",
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun - autonomous agent launchpad",
			description: "deploy autonomous AI agents that trade, learn, and earn on-chain. not chatbots. economic actors.",
			images: [SOCIAL_PREVIEW],
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

	const curatedTokens = CURATED_HOME_CONTRACTS.map((address) =>
		tokens.find((token) => token.contractAddress?.toLowerCase() === address),
	).filter(Boolean) as IToken[];

	const noTokens = curatedTokens.length === 0;

	return (
		<div className="flex flex-col w-full">
			<Hero />
			<WaifuHub />

			<div
				id="explore"
				className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 scroll-mt-20"
			>
				{noTokens ? (
					<div className="flex min-h-[50vh] items-center justify-center">
						<HomeEmptyState />
					</div>
				) : (
					<div className="relative overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,14,0.72)] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-6 sm:py-6 lg:px-8 lg:py-8">
						<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.08),transparent_32%)]" />
						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.14)] to-transparent" />
						<div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.14)] to-transparent" />

						<div className="relative flex flex-col gap-6 lg:gap-8">
							<ExplorerHeader tokenCount={curatedTokens.length} />
							<TokenGrid
								tokens={curatedTokens}
								imageOverrides={{
									[ELIZA_CONTRACT_ADDRESS.toLowerCase()]: ELIZA_HOMEPAGE_IMAGE,
								}}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
