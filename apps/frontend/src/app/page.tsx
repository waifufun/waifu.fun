import { getTokens } from "@/lib/api";
import { toApiSearchParams } from "@/lib/discovery-params";
import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";

export const revalidate = 4;

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
	const currentSearchParams = await searchParams;

	// Map new discovery params (sort, lifecycle) to API category/origin shape
	const sort = typeof currentSearchParams.sort === "string" ? currentSearchParams.sort : null;
	const lifecycle = typeof currentSearchParams.lifecycle === "string" ? currentSearchParams.lifecycle : null;
	const origin = typeof currentSearchParams.origin === "string" ? currentSearchParams.origin : null;
	const apiParams = toApiSearchParams({ sort, lifecycle, origin });

	const tokens = await getTokens({ searchParams: apiParams });
	const view = currentSearchParams?.view || "grid";
	const noTokens = (tokens?.length || 0) === 0;

	return (
		<div className={`flex flex-col gap-4 container ${noTokens ? "h-screen justify-center items-center" : ""}`}>
			<div className="flex flex-col items-center w-full">
				{noTokens ? (
					<div className="flex flex-col items-center gap-3">
						<h1 className="text-[#03FF23] text-lg font-semibold uppercase">No tokens found</h1>
						<span className="text-[#52525b] text-sm">Check back soon.</span>
					</div>
				) : view === "grid" ? (
					<TokenGrid tokens={tokens} />
				) : (
					<ListView tokens={tokens} />
				)}
			</div>
		</div>
	);
}
