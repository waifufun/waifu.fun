import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";
import Hero from "@/components/hero";
import mockTokens from "@/data/mock-tokens.json";
import type { IToken } from "@waifufun/types";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun - agent token launchpad",
		description:
			"Launch tokens fairly with autonomous AI agents on Solana, Ethereum, and Base. Where chaos meets code.",
		openGraph: {
			title: "waifu.fun - agent token launchpad",
			description:
				"Launch tokens fairly with autonomous AI agents on Solana, Ethereum, and Base. Where chaos meets code.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun - agent token launchpad",
			description:
				"Launch tokens fairly with autonomous AI agents on Solana, Ethereum, and Base. Where chaos meets code.",
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
		<div className="flex flex-col w-full">
			<Hero />
			
			<div className="relative z-10 px-4 md:px-8 py-12 bg-waifufun-background-primary">
				<div className="max-w-7xl mx-auto">
					<div className="flex items-center justify-between mb-8">
						<h2 className="text-3xl font-bold">
							<span className="text-waifufun-neon-pink">⚡</span>
							<span className="text-white ml-2">Trending Tokens</span>
						</h2>
						
						<div className="flex gap-2 text-sm font-mono">
							<span className="text-waifufun-text-info">// live feed</span>
						</div>
					</div>
					
					{noTokens ? (
						<div className="flex items-center justify-center h-64 border-2 border-dashed border-waifufun-stroke-primary rounded-lg">
							<p className="text-waifufun-neon-cyan text-lg font-mono uppercase">
								// no tokens found
							</p>
						</div>
					) : view === "grid" ? (
						<TokenGrid tokens={tokens} />
					) : (
						<ListView tokens={tokens} />
					)}
				</div>
			</div>
		</div>
	);
}
