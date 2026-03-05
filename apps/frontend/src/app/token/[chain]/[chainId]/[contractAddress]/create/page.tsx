import { getToken } from "@/lib/api";
import { getMockToken } from "@/lib/mock-api";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import TokenCreatePageClient from "@/components/token-page/ai-create";

export default async function TokenCreatePage({ params }: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const tokenParams = (await params) as unknown as ITokenLookUp;
	let token: IToken | null = null;
	try {
		token = (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.warn("API fetch failed, using mock data:", e);
		token = getMockToken(tokenParams.contractAddress);
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
