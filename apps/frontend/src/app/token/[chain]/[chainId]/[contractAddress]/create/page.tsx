import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";

type Params = Promise<ITokenLookUp>;

export default async function Page({ params }: { params: Params }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return <div>ai create</div>;
}
