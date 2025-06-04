import { getTrades } from "@/lib/api";
import type { IToken } from "@autofun/types";
import TradesClient from "./trades-client";

export default async function Trades({ token }: { token: IToken }) {
	const data = await getTrades({
		chain: token.chain,
		chainId: token.chainId,
		contractAddress: token.contractAddress,
	});

	return <TradesClient token={token} initialData={data} />;
}
