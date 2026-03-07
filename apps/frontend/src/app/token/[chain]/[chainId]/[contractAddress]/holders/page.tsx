import Holders from "@/components/token-page/holders";
import { getToken } from "@/lib/api";
import { getMockToken } from "@/lib/mock-api";
import type { IToken, ITokenLookUp } from "@waifufun/types";

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	try {
		token = (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.warn("API fetch failed, using mock data:", e);
		token = getMockToken(tokenParams.contractAddress);
	}
	if (!token) return null;
	return <Holders token={token} />;
}
