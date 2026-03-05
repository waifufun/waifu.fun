import Holders from "@/components/token-page/holders";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@waifufun/types";

export default async function Page({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}) {
	const tokenParams = await params as ITokenLookUp;
	const token = await getToken(tokenParams);
	return <Holders token={token} />;
}
