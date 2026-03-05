import Chat from "@/components/token-page/chat";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@waifufun/types";

export default async function Page({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}) {
	const tokenParams = await params as ITokenLookUp;
	const token = await getToken(tokenParams);
	return <Chat token={token} />;
}
