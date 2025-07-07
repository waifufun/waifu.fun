// import { getPresales } from "@/lib/api";
// import type { Metadata } from "next";
// import PresaleGrid from "@/components/incubator/presale-grid";
// import { Suspense } from "react";
// import { LoaderCircle } from "lucide-react";
// import IncubatorAdminButton from "@/components/incubator/incubator-admin-button";

// export const revalidate = 4;

// export const generateMetadata = async (): Promise<Metadata> => {
// 	return {
// 		title: "Incubator - Auto.Fun",
// 		description: "Discover curated launches and early-stage projects on Auto.Fun's incubator platform.",
// 		openGraph: {
// 			title: "Incubator - Auto.Fun",
// 			description: "Discover curated launches and early-stage projects on Auto.Fun's incubator platform.",
// 			type: "website",
// 			locale: "en_US",
// 		},
// 		twitter: {
// 			card: "summary_large_image",
// 			title: "Incubator - Auto.Fun",
// 			description: "Discover curated launches and early-stage projects on Auto.Fun's incubator platform.",
// 		},
// 	};
// };

// export default async function IncubatorPage({
// 	searchParams,
// }: {
// 	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
// }) {
// 	const currentSearchParams = await searchParams;
// 	const presales = await getPresales({ searchParams: currentSearchParams });
// 	const noPresales = (presales?.length || 0) === 0;

// 	return (
// 		<div className={`flex flex-col gap-4 container ${noPresales ? "h-screen justify-center items-center" : ""}`}>
// 			<div className="flex flex-col items-center w-full">
// 				<div className="relative w-full max-w-7xl mb-8">
// 					<div className="flex items-center justify-between">
// 						<div className="flex items-center gap-3">
// 							<h1
// 								className="text-5xl sm:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#03FF23] via-[#00FFD0] to-[#03FF23] drop-shadow-[0_2px_16px_#03FF23aa]"
// 								style={{ letterSpacing: "-0.03em" }}
// 							>
// 								Incubator
// 							</h1>
// 							<span className="ml-2 px-3 py-1 rounded-full bg-[#03FF23]/10 text-[#03FF23] text-xs font-bold border border-[#03FF23]/30 shadow-sm uppercase tracking-widest">
// 								Curated
// 							</span>
// 						</div>
// 						<IncubatorAdminButton />
// 					</div>
// 					<div className="mt-2 flex items-center">
// 						<span className="block h-1 w-16 bg-gradient-to-r from-[#03FF23] via-[#00FFD0] to-transparent rounded-full mr-3" />
// 						<p className="text-gray-400 text-base sm:text-lg tracking-wide font-mono">Curated partner launches</p>
// 					</div>
// 					<div className="absolute inset-0 pointer-events-none">
// 						<div className="w-1/2 h-24 bg-gradient-to-r from-[#03FF23]/10 to-transparent blur-2xl opacity-60 absolute top-0 left-0" />
// 					</div>
// 				</div>

// 				{noPresales ? (
// 					<div className="flex flex-col items-center justify-center py-20">
// 						<h2 className="text-[#03FF23] text-lg font-semibold uppercase mb-4">No presales found</h2>
// 						<p className="text-gray-500 text-center max-w-md">
// 							Check back soon for exciting new presales and early-stage projects.
// 						</p>
// 					</div>
// 				) : (
// 					<Suspense
// 						fallback={
// 							<div className="flex justify-center items-center py-20">
// 								<LoaderCircle className="h-8 w-8 text-[#03FF23] animate-spin" />
// 							</div>
// 						}
// 					>
// 						<PresaleGrid presales={presales} />
// 					</Suspense>
// 				)}
// 			</div>
// 		</div>
// 	);
// }
