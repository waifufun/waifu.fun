import Holders from "@/components/token-page/holders";
import { getToken } from "@/lib/api";
import { fetchTokenRouteParamsForStaticExport, isStaticExport } from "@/lib/static-export-paths";
import type { IToken, ITokenLookUp } from "@waifufun/types";

export async function generateStaticParams() {
	if (!isStaticExport()) return [];
	return fetchTokenRouteParamsForStaticExport();
}

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
	return <Holders token={token} />;
}
