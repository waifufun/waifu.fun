import { fetchTokenRouteParamsForStaticExport } from "@/lib/static-export-paths";
import { redirect } from "next/navigation";

export async function generateStaticParams() {
	return fetchTokenRouteParamsForStaticExport();
}

export default async function Page({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }) {
	const { chain, chainId, contractAddress } = await params;
	redirect(`/token/${chain}/${chainId}/${contractAddress}`);
}
