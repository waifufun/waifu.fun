import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import TokenCreatePageClient from "@/components/token-page/ai-create";

export default async function TokenCreatePage({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	try {
		token = (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.error("API fetch failed:", e);
	}

	if (!token) {
		return (
			<div className="text-center py-10 text-gray-500">
				<p className="text-lg uppercase">Token not found</p>
			</div>
		);
	}

	return <TokenCreatePageClient token={token} />;
}
