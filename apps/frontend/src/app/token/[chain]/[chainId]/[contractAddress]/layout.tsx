import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@autofun/types";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageClient from "./components/page-client";
import { notFound, redirect } from "next/navigation";

export const revalidate = 4;

export async function generateMetadata({ params }: { params: Promise<ITokenLookUp> }): Promise<Metadata> {
	const tokenParams = await params;
	// bsc tokens are agents, metadata handled by /agent route
	if (
		String(tokenParams.chain).toLowerCase() === "bsc" &&
		String(tokenParams.chainId) === "56"
	) {
		return {};
	}

	const token = (await getToken(tokenParams)) as IToken;
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

	// bsc tokens now live as agents — redirect to the agent home
	if (
		String(tokenParams.chain).toLowerCase() === "bsc" &&
		String(tokenParams.chainId) === "56"
	) {
		redirect(`/agent/${tokenParams.contractAddress}`);
	}

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
