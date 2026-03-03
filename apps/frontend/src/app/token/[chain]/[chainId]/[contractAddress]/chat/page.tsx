import Chat from "@/components/token-page/chat";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@waifufun/types";

export default async function Page({ params }: { params: Promise<ITokenLookUp> }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return <Chat token={token} />;
}
