import { redirect } from "next/navigation";
import { fetchTokenRouteParamsForStaticExport, isStaticExport } from "@/lib/static-export-paths";

export async function generateStaticParams() {
	if (!isStaticExport()) return [];
	return fetchTokenRouteParamsForStaticExport();
}

export default async function TokenCreatePage({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const { chain, chainId, contractAddress } = await params;
	redirect(`/token/${chain}/${chainId}/${contractAddress}`);
}
