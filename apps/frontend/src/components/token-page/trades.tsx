import { getTrades } from "@/lib/api";
import type { IToken } from "@waifufun/types";
import TradesClient from "./trades-client";

export default async function Trades({ token }: { token: IToken }) {
	let data: unknown[] = [];
	try {
		data = await getTrades({
			chain: token.chain,
			chainId: token.chainId,
			contractAddress: token.contractAddress,
		});
	} catch (e) {
		console.warn("API fetch failed for trades:", e);
	}

	return <TradesClient token={token} initialData={data} />;
}
