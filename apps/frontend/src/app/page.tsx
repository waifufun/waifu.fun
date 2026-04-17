import ActivityStrip from "@/components/landing/activity-strip";
import Hero from "@/components/landing/hero";
import HowItWorks from "@/components/landing/how-it-works";
import ListView from "@/components/list-view";
import TokenGrid from "@/components/token-grid";
import { getTokens } from "@/lib/api";
import type { Metadata } from "next";
import { Suspense } from "react";

export const revalidate = 4;

export const generateMetadata = async (): Promise<Metadata> => {
	const title = "waifu.fun — agents that own themselves";
	const description =
		"every waifu agent gets a wallet, a brain, a token, and a treasury. launch an autonomous agent on BSC in under a minute.";
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
	const hasTokens = (tokens?.length || 0) > 0;

	return (
		<div className="flex flex-col">
			{/* hero */}
			<Hero />

			{/* live activity strip */}
			<Suspense fallback={<div className="border-y border-white/10 bg-[#050506] h-[92px]" />}>
				<ActivityStrip />
			</Suspense>

			{/* how it works */}
			<HowItWorks />

			{/* legacy token grid (kept under a quiet divider for now) */}
			{hasTokens && (
				<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pb-24">
					<div className="mb-6 flex items-end justify-between border-t border-white/10 pt-10">
						<div>
							<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/40 mb-2">
								recent launches
							</div>
							<h2 className="text-xl md:text-2xl tracking-tight text-white">live on the curve</h2>
						</div>
					</div>
					<div className="flex flex-col items-center w-full">
						{view === "grid" ? <TokenGrid tokens={tokens} /> : <ListView tokens={tokens} />}
					</div>
				</div>
			)}
		</div>
	);
}
