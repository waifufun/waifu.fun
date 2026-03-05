import ScrollToTop from "@/components/scroll-to-top";
import Trades from "@/components/token-page/trades";
import { getToken } from "@/lib/api";
import { getMockToken } from "@/lib/mock-api";
import type { IToken, ITokenLookUp } from "@waifufun/types";

export default async function Page({ params }: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	
	try {
		token = await getToken(tokenParams);
	} catch (e) {
		console.error("API fetch failed, trying mock data:", e);
		token = getMockToken(tokenParams.contractAddress);
	}
	
	if (!token) {
		return null;
	}
	
	return (
		<>
			<ScrollToTop />
			<Trades token={token} />
		</>
	);
}
