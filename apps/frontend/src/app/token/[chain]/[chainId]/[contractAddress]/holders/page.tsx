import Holders from "@/components/token-page/holders";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";

export default async function Page({ params }: { params: ITokenLookUp }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return <Holders token={token} />;
}
