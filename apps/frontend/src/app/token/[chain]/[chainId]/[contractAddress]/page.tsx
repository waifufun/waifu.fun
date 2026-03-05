import ScrollToTop from "@/components/scroll-to-top";
import Trades from "@/components/token-page/trades";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@waifufun/types";

export default async function Page({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}) {
	const tokenParams = await params as ITokenLookUp;
	const token = await getToken(tokenParams);
	return (
		<>
			<ScrollToTop />
			<Trades token={token} />
		</>
	);
}
