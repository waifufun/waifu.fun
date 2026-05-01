import { getToken } from "@/lib/api";
import { fetchTokenRouteParamsForStaticExport, isStaticExport } from "@/lib/static-export-paths";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import PageClient from "./components/page-client";

export const revalidate = 4;

export async function generateStaticParams() {
	if (!isStaticExport()) return [];
	return fetchTokenRouteParamsForStaticExport();
}

async function fetchTokenWithFallback(tokenParams: ITokenLookUp): Promise<IToken | null> {
	try {
		return (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.error("API fetch failed:", e);
		return null;
	}
}

function isBscAgent(tokenParams: { chain?: string; chainId?: string }): boolean {
	return String(tokenParams.chain).toLowerCase() === "bsc" && String(tokenParams.chainId) === "56";
}

export async function generateMetadata({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }): Promise<Metadata> {
	const rawParams = await params;
	// bsc tokens are agents; metadata handled by /agent route
	if (isBscAgent(rawParams)) return {};

	const tokenParams = rawParams as unknown as ITokenLookUp;
	const token = await fetchTokenWithFallback(tokenParams);

	if (!token) {
		return {
			title: "Token Not Found",
			description: "The requested token could not be found.",
		};
	}

	return {
		title: `${token.name} (${token.ticker} - ${token.price} on ${token.chain})`,
		description: `${token.name} token information, price, and market data on waifufun`,
		openGraph: {
			title: `${token.name} (${token.ticker})`,
			description: `${token.name} token information, price, and market data on waifufun`,
		},
		twitter: {
			card: "summary_large_image",
			title: `${token.name} (${token.ticker})`,
			description: `${token.name} token information, price, and market data on waifufun`,
		},
	};
}

export default async function Page({
	params,
	children,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }>; children: ReactNode }) {
	const rawParams = await params;
	// bsc tokens now live as agents -- redirect to the agent home
	if (isBscAgent(rawParams)) {
		redirect(`/agent/${rawParams.contractAddress}`);
	}

	const tokenParams = rawParams as unknown as ITokenLookUp;
	const token = await fetchTokenWithFallback(tokenParams);

	if (!token) notFound();

	return (
		<PageClient initialData={token} tokenParams={tokenParams}>
			{children}
		</PageClient>
	);
}
