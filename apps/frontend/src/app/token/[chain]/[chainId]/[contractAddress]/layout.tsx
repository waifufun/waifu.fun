import { getToken } from "@/lib/api";
import { getMockToken } from "@/lib/mock-api";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageClient from "./components/page-client";
import { notFound } from "next/navigation";

export const revalidate = 4;

async function fetchTokenWithFallback(tokenParams: ITokenLookUp): Promise<IToken | null> {
	try {
		return (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.error("API fetch failed, trying mock data:", e);
		// Fall back to mock data
		return getMockToken(tokenParams.contractAddress);
	}
}

export async function generateMetadata({
	params,
}: { params: Promise<{ chain: string; chainId: string; contractAddress: string }> }): Promise<Metadata> {
	const tokenParams = (await params) as unknown as ITokenLookUp;
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
	const tokenParams = (await params) as unknown as ITokenLookUp;
	const token = await fetchTokenWithFallback(tokenParams);

	if (!token) notFound();

	return (
		<PageClient initialData={token} tokenParams={tokenParams}>
			{children}
		</PageClient>
	);
}
