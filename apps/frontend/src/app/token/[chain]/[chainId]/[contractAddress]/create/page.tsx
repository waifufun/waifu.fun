import { redirect } from "next/navigation";

export default async function TokenCreatePage({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const { chain, chainId, contractAddress } = await params;
	redirect(`/token/${chain}/${chainId}/${contractAddress}`);
}
