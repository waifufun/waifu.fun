import Trades from "@/components/token-page/trades";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";

export default async function Page({ params }: { params: ITokenLookUp }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return <Trades token={token} />;
}
