import ScrollToTop from "@/components/scroll-to-top";
import TradesClient from "@/components/token-page/trades-client";
import { getToken, getTrades } from "@/lib/api";
import { fetchTokenRouteParamsForStaticExport, isStaticExport } from "@/lib/static-export-paths";
import type { IToken, ITokenLookUp } from "@waifufun/types";

export async function generateStaticParams() {
	if (!isStaticExport()) return [];
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

	if (!token) {
		return null;
	}

	return (
		<>
			<ScrollToTop />
			<TradesClient token={token} initialData={initialTrades} />
		</>
	);
}
