import Swap from "@/components/swap";
import { Button } from "@/components/ui/button";
import Verified from "@/components/verified";
import { getToken } from "@/lib/api";
import { abbreviateNumber, fromNow } from "@/lib/utils";
import type { ITokenLookUp } from "@autofun/types";
import Image from "next/image";
import { formatUnits } from "viem";

export default async function Page({ params }: { params: ITokenLookUp }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4">
				<div className="w-full lg:w-3/4 flex flex-col gap-4 order-3 lg:order-2">
					<div className="flex items-center gap-6">
						{/* Image */}
						<Image src={token.image} width={60} height={60} unoptimized alt="token_image" className="size-[60px]" />
						{/* Token Name */}
						<div className="flex flex-col">
							{/* Name */}
							<div className="flex items-center gap-3">
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
					<div className="w-full flex flex-wrap justify-between">
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
						].map((item, _) => (
							<div className="inline-flex justify-center items-center gap-3" key={_}>
								<div className="justify-start text-autofun-text-secondary  text-xl font-medium font-satoshi leading-tight">
									{item.title}
								</div>
								<div className="justify-start text-autofun-text-highlight text-2xl font-medium font-satoshi leading-normal">
									{item.value}
								</div>
							</div>
						))}
					</div>
					<div className="w-full min-h-[500px] relative">
						<iframe
							height="100%"
							width="100%"
							className="min-h-[500px] h-full"
							id="geckoterminal-embed"
							title="GeckoTerminal Embed"
							src={`https://www.geckoterminal.com/${token.chain}/pools/${token.contractAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
							allow="clipboard-write"
							allowFullScreen
						/>
					</div>
					<div className="flex items-center gap-2">
						{["Trades", "Holders", "AI Create", "Chat", "Agents"].map((tab) => (
							<Button key={tab}>{tab}</Button>
						))}
					</div>
				</div>
				<div className="w-full lg:w-1/4 flex flex-col md:flex-row lg:flex-col gap-3 order-2 lg:order-3">
					<Swap />
					<div className="flex justify-between flex-col">
						<div className="flex flex-col gap-1 items-center py-4">
							<span className=" text-autofun-text-secondary">Total Supply</span>
							<span className="text-xl  text-autofun-text-primary">
								{token?.totalSupply && token?.decimals
									? abbreviateNumber(Number(formatUnits(BigInt(token.totalSupply), token.decimals)), true)
									: "-"}
							</span>
						</div>
						<div className="flex flex-col gap-1 items-center py-4">
							<span className=" text-autofun-text-secondary">Price USD</span>
							<span className="text-xl  text-autofun-text-primary">{token.price}</span>
						</div>

						{token?.holders ? (
							<div className="flex flex-col gap-1 items-center py-4">
								<span className=" text-autofun-text-secondary">Holders</span>
								<span className="text-xl  text-autofun-text-primary">{token?.holders}</span>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
