import Agents from "@/components/token-page/agents";
import { getAgent, getToken } from "@/lib/api";
import type { IAgent, IToken, ITokenLookUp, TChainId } from "@waifufun/types";

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	try {
		token = (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.warn("API fetch failed for token:", e);
	}
	if (!token) {
		return (
			<div className="py-12 w-full flex place-content-center">
				<div className="p-4 py-8 text-center w-full text-sm text-[#71717a] font-mono">
					Unable to load token data.
				</div>
			</div>
		);
	}

	let data: { docs?: IAgent[] } | null = null;
	try {
		data = await getAgent({
			contractAddress: token.contractAddress,
			chain: token.chain,
			chainId: token.chainId as TChainId,
		});
	} catch (e) {
		console.warn("API fetch failed for agents:", e);
	}

	return (
		<div className="py-12 w-full flex place-content-center">
			<Agents agents={data?.docs ?? []} token={token} />
		</div>
	);
}
