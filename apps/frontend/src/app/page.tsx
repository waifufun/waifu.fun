import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";
import Hero from "@/components/landing/hero";
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
			
			<div className={`flex flex-col gap-4 w-full px-4 sm:px-6 lg:px-8 py-8 ${noTokens ? "min-h-[50vh] justify-center items-center" : ""}`}>
				{noTokens ? (
					<h1 className="text-[#8b5cf6] text-lg font-semibold uppercase">No tokens found</h1>
				) : (
					<>
						<h2 className="font-mono text-sm uppercase tracking-[0.2em] text-[#71717a] mb-4">
							live feed
						</h2>
						{view === "grid" ? (
							<TokenGrid tokens={tokens} />
						) : (
							<ListView tokens={tokens} />
						)}
					</>
				)}
			</div>
		</div>
	);
}
