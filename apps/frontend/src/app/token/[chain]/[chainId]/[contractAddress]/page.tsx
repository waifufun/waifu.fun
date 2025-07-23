import ScrollToTop from "@/components/scroll-to-top";
import Trades from "@/components/token-page/trades";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";

export default async function Page({ params }: { params: Promise<ITokenLookUp> }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return (
		<>
			<ScrollToTop />
			<Trades token={token} />
		</>
	);
}
