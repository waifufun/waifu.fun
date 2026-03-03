import { getTrades } from "@/lib/api";
import type { IToken } from "@waifufun/types";
import TradesClient from "./trades-client";

export default async function Trades({ token }: { token: IToken }) {
	const data = await getTrades({
		chain: token.chain,
		chainId: token.chainId,
		contractAddress: token.contractAddress,
	});

	return <TradesClient token={token} initialData={data} />;
}
