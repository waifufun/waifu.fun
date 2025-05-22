import ChainIndicator from "@/components/chain-indicator";
import Swap from "@/components/token-page/swap";
import TokenTabs from "@/components/token-page/token-tabs";
import Verified from "@/components/verified";
import { getToken } from "@/lib/api";
import { abbreviateNumber, fromNow, getCoinGeckoChainName } from "@/lib/utils";
import type { ITokenLookUp } from "@autofun/types";
import Image from "next/image";
import type { Metadata } from "next";
import BondingCurveProgress from "@/components/bonding-curve-progress";

export async function generateMetadata({ params }: { params: ITokenLookUp }): Promise<Metadata> {
	const token = await getToken(await params);

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

export default async function Page({ params }: { params: ITokenLookUp }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4">
				<div className="w-full lg:w-3/4 flex flex-col gap-4 order-3 lg:order-2">
					<div className="px-6 py-3 bg-[#333333]/10 rounded-lg flex items-center justify-between">
						<div className="flex items-center gap-6">
							{/* Image */}
							<Image
								src={token.image}
								width={60}
								height={60}
								unoptimized
								alt="token_image"
								className="size-[60px] rounded-lg"
							/>
							{/* Token Name */}
							<div className="flex flex-col">
								{/* Name */}
								<div className="flex items-center gap-3">
									<ChainIndicator chain={token.chain} chainId={token.chainId} />
									<Verified isVerified={token?.verified} />
									<span className="text-white text-2xl font-medium font-satoshi uppercase">{token.name}</span>
									<div className="h-5 w-[1px] bg-autofun-background-disabled" />
									<span className="text-xl font-medium uppercase text-autofun-text-secondary">{token.ticker}</span>
								</div>
								{/* Creator */}
								<div className="flex items-center gap-1.5 text-autofun-text-secondary text-base font-normal font-satoshi ">
									<div className="capitalize">Created by:</div>
									<div className="hover:underline">{token?.creator ? token?.creator : "-"}</div>
								</div>
							</div>
						</div>
						<div className="gap-9 flex flex-wrap justify-between">
							{[
								{
									title: "Market Cap",
									value: token?.marketcap ? abbreviateNumber(token?.marketcap) : "-",
								},
								{
									title: "24hr Volume",
									value: token?.volume24h ? abbreviateNumber(token?.volume24h) : "-",
								},
								{
									title: "Holders",
									value: token?.holders ? abbreviateNumber(token?.holders, true) : "-",
								},
								{
									title: "Price",
									value: token?.price,
								},
								{
									title: "Age",
									value: token?.createdAt ? fromNow(token?.createdAt, true) : "-",
								},
							].map((item) => (
								<div className="flex flex-col items-center" key={item.title}>
									<div className="justify-start text-autofun-text-secondary  text-base font-medium font-satoshi leading-tight">
										{item.title}
									</div>
									<div className="justify-start text-autofun-text-highlight text-lg font-medium font-satoshi leading-normal">
										{item.value}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="w-full min-h-[540px] relative rounded-lg overflow-hidden">
						<iframe
							height="100%"
							width="100%"
							className="min-h-[581px] h-full mb-[-41px]"
							id="geckoterminal-embed"
							title="GeckoTerminal Embed"
							src={`https://www.geckoterminal.com/${getCoinGeckoChainName(token.chain, token.chainId)}/pools/${token.contractAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
							allow="clipboard-write"
							allowFullScreen
						/>
					</div>

					<TokenTabs token={token} />
				</div>
				<div className="w-full lg:w-1/4 flex flex-col md:flex-row lg:flex-col gap-3 order-2 lg:order-3">
					<Swap />
					<BondingCurveProgress token={token} />
				</div>
			</div>
		</div>
	);
}
