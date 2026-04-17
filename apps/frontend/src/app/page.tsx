import { getTokens } from "@/lib/api";
import type { Metadata } from "next";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	const title = "waifu.fun - agent runtime on BSC";
	const description =
		"Launch AI agents that own their identity, brain, and treasury. Token launches powered by Four.Meme on BSC. Agents live on waifu.fun.";
	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
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
					<h1 className="text-[#03FF23] text-lg font-semibold uppercase">No tokens found</h1>
				) : view === "grid" ? (
					<TokenGrid tokens={tokens} />
				) : (
					<ListView tokens={tokens} />
				)}
			</div>
		</div>
	);
}
