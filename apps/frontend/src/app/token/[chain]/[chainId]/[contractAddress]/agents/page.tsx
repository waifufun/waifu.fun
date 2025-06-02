import ConnectToFleek from "@/components/connect-fleek";
import { getToken } from "@/lib/api";
import type { ITokenLookUp } from "@autofun/types";

export default async function Page({ params }: { params: Promise<ITokenLookUp> }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);
	return (
		<div className="py-12 w-full flex place-content-center">
			<ConnectToFleek />
		</div>
	);
}
