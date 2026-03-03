import Holders from "@/components/token-page/holders";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@waifufun/types";

export default async function Page({ params }: { params: Promise<ITokenLookUp> }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return <Holders token={token} />;
}
