import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageClient from "./components/page-client";
import { notFound } from "next/navigation";

export const revalidate = 4;

export async function generateMetadata({ 
	params 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }> 
}): Promise<Metadata> {
	const resolvedParams = await params;
	const token = (await getToken(resolvedParams as ITokenLookUp)) as IToken;
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
	children 
}: { 
	params: Promise<{ chain: string; chainId: string; contractAddress: string }>; 
	children: ReactNode 
}) {
	const tokenParams = await params as ITokenLookUp;
	let token: null | IToken = null;
	try {
		token = (await getToken(tokenParams)) as IToken;
	} catch (e) {
		console.error(e);
	}

	if (!token) notFound();

	return (
		<PageClient initialData={token} tokenParams={tokenParams}>
			{children}
		</PageClient>
	);
}
