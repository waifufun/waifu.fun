"use client";
import Swap from "@/components/swap";
import TokenTabs from "@/components/token-page/token-tabs";
import Verified from "@/components/verified";
import { getToken } from "@/lib/api";
import {
	abbreviateNumber,
	cn,
	formatNumberSubscript,
	fromNow,
	getCoinGeckoChainName,
	shortenAddress,
} from "@/lib/utils";
import type { IToken, ITokenLookUp } from "@autofun/types";
import Image from "next/image";
import BondingCurveProgress from "@/components/bonding-curve-progress";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import ScamWarning from "@/components/scam-notice";
import { useQuery } from "@tanstack/react-query";
import Chart from "@/components/chart/chart";
import ChainIndicator from "@/components/chain-indicator";

export default function PageClient({
	initialData,
	tokenParams,
	children,
}: { initialData: IToken; children: ReactNode; tokenParams: ITokenLookUp }) {
	const query = useQuery({
		queryKey: ["token", initialData.chain, initialData.chainId, initialData.contractAddress],
		queryFn: async () => {
			const token = (await getToken(tokenParams)) as IToken;
			return token;
		},
		refetchInterval: 6_000,
		initialData,
	});

	const token = query?.data;
	
	return (
		<div className="flex flex-col gap-6 mt-3">
			<ScamWarning isHidden={!!token?.hidden} />
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-6">
				<div className="w-full lg:w-7/10 flex flex-col gap-6 order-3 lg:order-2">
					<div className="p-4 bg-[#333333]/10 rounded-lg flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
						<div className="flex items-center gap-4">
							{/* Image */}
							<Image
								src={token.image}
								width={60}
								height={60}
								unoptimized
								alt="token_image"
								className="size-[60px] rounded-lg select-none"
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
									<div className="hover:underline">
										<Link href={`/profile/${token.creator}`}>
											{token?.creator ? shortenAddress(token?.creator) : "-"}
										</Link>
									</div>
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
									value: formatNumberSubscript(token?.price),
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
						<Chart 
							token={token}
							tokenLookUp={{
								chain: token.chain,
								chainId: token.chainId,
								contractAddress: token.contractAddress,
							} as ITokenLookUp}
						/>
					</div>

					<div className="flex flex-col">
						<TokenTabs token={token} />
						{children}
					</div>
				</div>
				<div className="w-full lg:w-3/10 flex flex-col md:flex-row lg:flex-col gap-6 order-2 lg:order-3">
					<Swap token={token} />
					<BondingCurveProgress token={token} />
					<div className="flex flex-col gap-4 rounded-xl bg-[#0c0c0c] p-4">
						<div className="flex items-center gap-4 justify-between">
							<span className="text-lg border-b border-autofun-background-action-highlight font-medium">
								TOKEN INFO
							</span>

							<div className="flex items-center gap-6">
								{[
									{
										title: "website",
										href: token?.socials?.website,
										icon: "/socials/website.svg",
									},
									{
										title: "twitter",
										href: token?.socials?.twitter,
										icon: "/socials/twitter.svg",
									},
									{
										title: "telegram",
										href: token?.socials?.telegram,
										icon: "/socials/telegram.svg",
									},
									{
										title: "discord",
										href: token?.socials?.discord,
										icon: "/socials/discord.svg",
									},
								].map((social) => {
									const hasLink = !!social?.href;
									const Comp = hasLink ? Link : Fragment;

									const compProps: { key: string; href?: string; target?: string } = {
										key: social.title,
									};

									if (hasLink && social.href) {
										compProps.href = social.href;
										compProps.target = "_blank";
									}

									return (
										// @ts-ignore
										<Comp {...compProps} key={social.title}>
											<Image
												src={social.icon}
												className={cn([
													"size-6 select-none",
													!social?.href ? "opacity-50 cursor-not-allowed" : "opacity-100 cursor-pointer",
												])}
												unoptimized
												width={24}
												height={24}
												alt={social.title}
											/>
										</Comp>
									);
								})}
							</div>
						</div>
						<div>
							<Image
								src={token?.image}
								className="float-right w-52 h-52 ml-4 mb-2 rounded-xl object-cover"
								unoptimized
								priority
								width={208}
								height={208}
								alt="token"
							/>
							<div>
								<span className="font-medium text-xl text-autofun-background-action-highlight uppercase block">
									{token?.name}
								</span>
								<span className="font-medium text-xl uppercase block">{token?.ticker}</span>

								<p className="text-base text-autofun-text-secondary">
									{token?.description
										? token?.description
										: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?"}
								</p>
							</div>
						</div>
						<div className="mt-4 py-4 flex items-center gap-4 justify-between border-b border-autofun-background-action-highlight">
							<span className="text-base font-medium uppercase">{token.name}</span>
							<div className="gap-2 flex items-center">
								<CopyButton textToCopy={token.contractAddress} />
								<span className="text-sm font-medium">{shortenAddress(token?.contractAddress)}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
