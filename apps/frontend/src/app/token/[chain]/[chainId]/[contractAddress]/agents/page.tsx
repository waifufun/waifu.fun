import Agents from "@/components/token-page/agents";
import { getAgent, getToken } from "@/lib/api";
import { parseTokenParams } from "@/lib/route-params";
import type { TChainId } from "@waifufun/types";

export default async function Page({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}) {
	const tokenParams = parseTokenParams(await params);
	const token = await getToken(tokenParams);
	const data = await getAgent({
		contractAddress: token.contractAddress,
		chain: token.chain,
		chainId: token.chainId as TChainId,
	});

	return (
		<div className="py-12 w-full flex place-content-center">
			<Agents agents={data?.docs} token={token} />
		</div>
	);
}
