import ScrollToTop from "@/components/scroll-to-top";
import TradesClient from "@/components/token-page/trades-client";
import { getToken, getTrades } from "@/lib/api";
import { fetchTokenRouteParamsForStaticExport } from "@/lib/static-export-paths";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
	return fetchTokenRouteParamsForStaticExport();
}

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	let initialTrades: any[] = [];

	try {
		token = await getToken(tokenParams);
		if (token) {
			initialTrades = await getTrades({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			});
		}
	} catch (e) {
		console.error("API fetch failed:", e);
	}

	// Returning null here used to render a blank surface (no header, no copy)
	// when the API hiccuped or the params pointed at an unknown token. Match
	// the layout's notFound() behavior so the user lands on the proper 404
	// instead of staring at an empty page wondering if their wallet broke.
	if (!token) {
		notFound();
	}

	return (
		<>
			<ScrollToTop />
			<TradesClient token={token} initialData={initialTrades} />
		</>
	);
}
