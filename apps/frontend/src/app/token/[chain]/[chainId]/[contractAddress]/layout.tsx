import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@autofun/types";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageClient from "./components/page-client";

export async function generateMetadata({ params }: { params: Promise<ITokenLookUp> }): Promise<Metadata> {
	const token = (await getToken(await params)) as IToken;
	return {
		title: `${token.name} (${token.ticker} - ${token.price} on ${token.chain})`,
		description: `${token.name} token information, price, and market data on autofun`,
		openGraph: {
			title: `${token.name} (${token.ticker})`,
			description: `${token.name} token information, price, and market data on autofun`,
		},
		twitter: {
			card: "summary_large_image",
			title: `${token.name} (${token.ticker})`,
			description: `${token.name} token information, price, and market data on autofun`,
		},
	};
}

export default async function Page({ params, children }: { params: Promise<ITokenLookUp>; children: ReactNode }) {
	const tokenParams = await params;
	const token = (await getToken(tokenParams)) as IToken;
	return (
		<PageClient initialData={token} tokenParams={tokenParams}>
			{children}
		</PageClient>
	);
}
