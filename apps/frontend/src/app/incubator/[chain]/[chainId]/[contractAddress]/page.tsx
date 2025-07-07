// import { getPresale } from "@/lib/api";
// import type { Metadata } from "next";
// import { notFound } from "next/navigation";
// import PresaleDetails from "@/components/incubator/presale-details";

// export const revalidate = 4;

// export const generateMetadata = async ({
// 	params,
// }: {
// 	params: Promise<{ chain: string; chainId: string; contractAddress: string }>;
// }): Promise<Metadata> => {
// 	const { chain, chainId, contractAddress } = await params;

// 	try {
// 		const presale = await getPresale({ chain, chainId, contractAddress });

// 		return {
// 			title: `${presale.name} (${presale.symbol}) - Incubator - Auto.Fun`,
// 			description: presale.description,
// 			openGraph: {
// 				title: `${presale.name} (${presale.symbol}) - Incubator - Auto.Fun`,
// 				description: presale.description,
// 				images: [presale.image],
// 				type: "website",
// 				locale: "en_US",
// 			},
// 			twitter: {
// 				card: "summary_large_image",
// 				title: `${presale.name} (${presale.symbol}) - Incubator - Auto.Fun`,
// 				description: presale.description,
// 				images: [presale.image],
// 			},
// 		};
// 	} catch (error) {
// 		return {
// 			title: "Presale Not Found - Incubator - Auto.Fun",
// 			description: "The requested presale could not be found.",
// 		};
// 	}
// };

// export default async function PresalePage({
// 	params,
// }: {
// 	params: Promise<{ chain: string; chainId: string; contractAddress: string }>;
// }) {
// 	const { chain, chainId, contractAddress } = await params;

// 	try {
// 		const presale = await getPresale({ chain, chainId, contractAddress });

// 		return (
// 			<div className="flex flex-col gap-4 container">
// 				<div className="flex flex-col items-center w-full">
// 					<div className="w-full max-w-7xl">
// 						<PresaleDetails presale={presale} />
// 					</div>
// 				</div>
// 			</div>
// 		);
// 	} catch (error) {
// 		notFound();
// 	}
// }
