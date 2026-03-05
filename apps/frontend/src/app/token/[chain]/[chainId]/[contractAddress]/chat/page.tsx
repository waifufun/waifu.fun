import Chat from "@/components/token-page/chat";
import { getToken } from "@/lib/api";
import { parseTokenParams } from "@/lib/route-params";

export default async function Page({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}) {
	const tokenParams = parseTokenParams(await params);
	const token = await getToken(tokenParams);
	return <Chat token={token} />;
}
