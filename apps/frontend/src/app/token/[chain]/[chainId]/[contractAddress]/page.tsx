import ScrollToTop from "@/components/scroll-to-top";
import Trades from "@/components/token-page/trades";
import { getToken } from "@/lib/api";
import { parseTokenParams } from "@/lib/route-params";

export default async function Page({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}) {
	const tokenParams = parseTokenParams(await params);
	const token = await getToken(tokenParams);
	return (
		<>
			<ScrollToTop />
			<Trades token={token} />
		</>
	);
}
