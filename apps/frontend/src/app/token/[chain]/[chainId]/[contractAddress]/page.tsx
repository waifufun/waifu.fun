import ScrollToTop from "@/components/scroll-to-top";
import ActivityFeed from "@/components/token-page/activity-feed";
import Trades from "@/components/token-page/trades";
import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@waifufun/types";

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;

	try {
		token = await getToken(tokenParams);
	} catch (e) {
		console.error("API fetch failed:", e);
	}

	if (!token) {
		return null;
	}

	return (
		<>
			<ScrollToTop />
			<ActivityFeed token={token} />
			<Trades token={token} />
		</>
	);
}
