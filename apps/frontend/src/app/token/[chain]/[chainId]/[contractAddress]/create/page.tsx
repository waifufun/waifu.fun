import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import TokenCreatePageClient from "@/components/token-page/ai-create";

export default async function TokenCreatePage({ params }: { params: Promise<ITokenLookUp> }) {
	const tokenParams = await params;
	const token = (await getToken(tokenParams)) as IToken;

	if (!token) {
		return (
			<div className="text-center py-10 text-gray-500">
				<p className="text-lg uppercase">Token not found</p>
			</div>
		);
	}

	return <TokenCreatePageClient token={token} />;
}
