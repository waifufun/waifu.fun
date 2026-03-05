import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";
import mockTokens from "@/data/mock-tokens.json";
import type { IToken } from "@waifufun/types";
import { ExploreFilters } from "./explore-filters";

export const revalidate = 4;

export const metadata: Metadata = {
	title: "Explore Agents",
	description: "Browse and discover AI agents on waifu.fun.",
};

function getTokensForPage(): IToken[] {
	return mockTokens as IToken[];
}

export default async function ExplorePage({
	searchParams,
}: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
	const currentSearchParams = await searchParams;
	const tokens = getTokensForPage();
	const view = currentSearchParams?.view || "grid";
	const noTokens = (tokens?.length || 0) === 0;

	return (
		<div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
			{/* Page header */}
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
					Explore <span className="text-[#FF6B00]">Agents</span>
				</h1>
				<p className="text-sm text-zinc-500">
					Discover AI agents trading, creating, and building on Solana.
				</p>
			</div>

			{/* Filters */}
			<ExploreFilters />

			{/* Token grid/list */}
			{noTokens ? (
				<div className="flex flex-col items-center justify-center py-20">
					<h2 className="text-waifufun-text-highlight text-lg font-semibold uppercase">
						No agents found
					</h2>
					<p className="text-sm text-zinc-500 mt-1">Try adjusting your filters.</p>
				</div>
			) : view === "grid" ? (
				<TokenGrid tokens={tokens} />
			) : (
				<ListView tokens={tokens} />
			)}
		</div>
	);
}
