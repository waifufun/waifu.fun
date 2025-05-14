import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/api";
import { abbreviateNumber, fromNow } from "@/lib/utils";
import type { ITokenLookUp } from "@autofun/types";
import Image from "next/image";

export default async function Page({ params }: { params: ITokenLookUp }) {
	const tokenParams = await params;
	const token = await getToken(tokenParams);

	return (
		<div className="flex flex-col gap-3">
			<div className="w-full py-10 flex flex-wrap justify-between">
				<div className="flex-1 flex flex-col items-center">
					<span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
						{token?.marketcap ? abbreviateNumber(token?.marketcap) : "-"}
					</span>
					<span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">Market Cap</span>
				</div>
				<div className="flex-1 flex flex-col items-center">
					<span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
						{token?.volume24h ? abbreviateNumber(token?.volume24h) : "-"}
					</span>
					<span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">24hr Volume</span>
				</div>
				<div className="flex-1 flex flex-col items-center">
					<span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
						{token?.createdAt ? fromNow(token?.createdAt, true) : "-"}
					</span>
					<span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">Age</span>
				</div>
			</div>
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4">
				<div className="w-full lg:w-1/4 flex flex-col gap-3 order-1 lg:order-1">
					<div className="flex flex-col gap-3">
						<Image src={token.image} width={500} height={500} unoptimized alt={token.name} />

						{/* Description */}
						{/* <div>{token?.description}</div> */}
						{/* Contractaddress */}
						<div>{token?.contractAddress}</div>
						{/* Socials */}
						<div className="flex flex-col gap-4">
							{token?.socials?.twitter}
							{token?.socials?.website}
							{token?.socials?.telegram}
							{token?.socials?.discord}
						</div>
					</div>
				</div>
				<div className="w-full lg:w-1/2 flex flex-col gap-3 order-3 lg:order-2">
					<div className="flex items-center gap-2">
						{["Chart", "AI Create", "Chat", "Agents"].map((tab) => (
							<Button key={tab}>{tab}</Button>
						))}
					</div>
					<div className="w-full min-h-[500px] relative">
						<iframe
							height="100%"
							width="100%"
							className="min-h-[500px] mt-2"
							id="geckoterminal-embed"
							title="GeckoTerminal Embed"
							src={`https://www.geckoterminal.com/base/pools/${token.contractAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
							allow="clipboard-write"
							allowFullScreen
						/>
					</div>
				</div>
				<div className="w-full lg:w-1/4 flex flex-col md:flex-row lg:flex-col gap-3 order-2 lg:order-3">
					<div className="flex justify-between flex-col">
						<div className="flex flex-col gap-1 items-center py-4">
							<span className="font-dm-mono text-autofun-text-secondary">Total Supply</span>
							<span className="text-xl font-dm-mono text-autofun-text-primary">{token.totalSupply}</span>
						</div>
						<div className="flex flex-col gap-1 items-center py-4">
							<span className="font-dm-mono text-autofun-text-secondary">Price USD</span>
							<span className="text-xl font-dm-mono text-autofun-text-primary">{token.price}</span>
						</div>

						{token?.holders ? (
							<div className="flex flex-col gap-1 items-center py-4">
								<span className="font-dm-mono text-autofun-text-secondary">Holders</span>
								<span className="text-xl font-dm-mono text-autofun-text-primary">{token?.holders}</span>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
