import Chat from "@/components/token-page/chat";
import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@waifufun/types";

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	try {
		token = (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.error("API fetch failed:", e);
	}
	if (!token) return null;
	return <Chat token={token} />;
}
