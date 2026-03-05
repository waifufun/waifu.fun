"use client";
import Swap from "@/components/swap";
import TokenTabs from "@/components/token-page/token-tabs";
import Verified from "@/components/verified";
import { getToken } from "@/lib/api";
import { abbreviateNumber, cn, formatNumberSubscript, fromNow, shortenAddress } from "@/lib/utils";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import Image from "next/image";
import BondingCurveProgress from "@/components/bonding-curve-progress";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import ScamWarning from "@/components/scam-notice";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Clock, Star, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Chart from "@/components/chart/chart";
import useAddress from "@/hooks/use-address";
import ClaimFees from "@/components/claim-fees";
import UpdateSocialsModal from "./UpdateSocialsModal";
import { Button } from "@/components/ui/button";

export default function PageClient({
	initialData,
	tokenParams,
	children,
}: { initialData: IToken; children: ReactNode; tokenParams: ITokenLookUp }) {
	const query = useQuery({
		queryKey: ["token", initialData.chain, initialData.chainId, initialData.contractAddress],
		queryFn: async () => {
			try {
				const token = (await getToken(tokenParams)) as IToken;
				return token;
			} catch (e) {
				// API unavailable, return initialData (mock data) silently
				console.warn("API fetch failed, using initial data:", e);
				return initialData;
			}
		},
		// Disable refetch when API is not configured
		refetchInterval: process.env.NEXT_PUBLIC_API_URL ? 5_000 : false,
		initialData,
	});

	const currentAddress = useAddress();
	const token = query?.data;
	const isCreator = useMemo(() => {
		if (currentAddress && token?.creator) {
			return currentAddress.toLowerCase() === token.creator.toLowerCase();
		}
		return false;
	}, [currentAddress, token?.creator]);

	const getBadgeInfo = () => {
		if (initialData?.status === "migrating") {
			return {
				badge: "MIGRATING",
				classes: "bg-orange-400/80 hover:bg-orange-400/50 text-white border border-orange-400/50",
			};
		}

		if (initialData?.status === "migrated" || initialData?.status === "locked") {
			return {
				badge: "BONDED",
				classes:
					"bg-[#00ff87]/15 hover:bg-[#00ff87]/25 text-[#00ff87] border border-[#00ff87]/40 shadow-[0_0_8px_rgba(0,255,135,0.2)] py-0.5 px-1.5 text-[9px] sm:text-[10px]",
			};
		}
		if (initialData?.imported) {
			return {
				badge: "IMPORTED",
				classes:
					"bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40",
			};
		}

		return {
			badge: "ACTIVE",
			classes:
				"bg-[#00ff87]/15 hover:bg-[#00ff87]/25 text-[#00ff87] border border-[#00ff87]/40 py-0.5 px-1.5 text-[9px] sm:text-[10px]",
		};
	};

	const badge = getBadgeInfo();
	const badgeBaseClasses =
		"font-bold uppercase tracking-wider rounded-md text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1";

	const [socialsModalOpen, setSocialsModalOpen] = useState(false);

	return (
		<div className="flex flex-col gap-6 mt-3 container">
			<ScamWarning isHidden={!!token?.hidden} />
			<div className="bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] p-4 rounded-sm flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
				<div className="flex items-center gap-4">
					{/* Image */}
					<Image
						src={token.image}
						width={60}
						height={60}
						unoptimized
						alt="token_image"
						className="h-10 w-10 rounded-sm border border-[#00ff87]/30"
					/>
					{/* Token Name */}
					<div className="space-y-3 xl:space-y-0">
						{/* Name */}
						<div className="flex items-center gap-3 flex-wrap">
							{/* <ChainIndicator chain={token.chain} chainId={token.chainId} /> */}
							<Verified isVerified={token?.verified} />
							<span className="text-xl md:text-2xl font-bold text-[#e4e4e7] lowercase tracking-wide">
								{token.name}
							</span>
							<span className="text-lg text-[#00ff87] font-mono">{token.ticker}</span>
							<Badge className={cn(badgeBaseClasses, badge.classes)}>{badge.badge}</Badge>
							{token?.featured ? (
								<Badge
									className={cn(
										"font-bold mt-0.5 uppercase tracking-wider rounded-md text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1",
										"bg-amber-400/15 text-amber-300 border border-amber-400/40",
									)}
								>
									<Star className={cn("h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1", "fill-current")} /> FEATURED
								</Badge>
							) : null}
						</div>
						{/* Creator */}
						<div className="flex items-center gap-1.5 text-waifufun-text-secondary text-xs font-normal font-satoshi">
							<div className="capitalize">Created by:</div>
							<div className="hover:underline">
								<Link href={`/profile/${token.creator}`}>{token?.creator ? shortenAddress(token?.creator) : "-"}</Link>
							</div>
						</div>
					</div>
				</div>
				<div className="gap-0 w-full lg:w-fit mb-3 lg:mb-0 flex flex-wrap md:flex-row gap-y-5 xl:justify-around">
					{[
						{
							title: "Market Cap",
							value: token?.marketcap ? abbreviateNumber(token?.marketcap) : "-",
						},
						{
							title: "24hr Volume",
							value: token?.volume24h ? abbreviateNumber(token?.volume24h) : "-",
							icon: BarChart2,
						},
						{
							title: "Holders",
							value: token?.holders ? abbreviateNumber(token?.holders, true) : "-",
							icon: Users,
						},
						{
							title: "Price",
							value: formatNumberSubscript(token?.price),
						},
						{
							title: "Age",
							value: token?.createdAt ? fromNow(token?.createdAt, true) : "-",
							icon: Clock,
						},
					].map((item) => (
						<div className="flex flex-col items-end min-w-24" key={item.title}>
							<div className="text-waifufun-text-secondary uppercase text-xs place-self-start">{item.title}</div>
							<div className="inline-flex items-center gap-1 text-xs justify-start place-self-start text-waifufun-text-highlight font-medium font-satoshi leading-normal">
								{item?.icon ? <item.icon className="size-3 text-waifufun-background-action-highlight/70" /> : null}
								{item.value}
							</div>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-6">
				<div className="w-full lg:w-7/10 flex flex-col gap-6 order-3 lg:order-2">
					<div className="w-full relative">
						<div className="bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] p-3 rounded-sm">
							<div className="overflow-hidden">
								<Chart token={token} />
							</div>
						</div>
					</div>

					<div className="flex flex-col gap-4">
						<TokenTabs token={token} />
						{children}
					</div>
				</div>
				<div className="w-full lg:w-3/10 flex flex-col md:flex-row lg:flex-col gap-6 order-2 lg:order-3">
					<Swap token={token} />
					<div className="flex flex-col gap-4 bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.06)] p-4 rounded-sm">
						<BondingCurveProgress token={token} />
						<div className="flex flex-row gap-4 items-start">
							<Image
								src={token?.image}
								className="max-w-[50px] rounded-sm border border-[#00ff87]/30 mt-1 flex-shrink-0"
								unoptimized
								priority
								width={208}
								height={208}
								alt="token"
							/>
							<div className="flex flex-col min-w-0">
								<div className="flex items-center flex-wrap gap-2 min-w-0">
									<span className="font-medium text-lg text-waifufun-background-action-highlight uppercase block truncate">
										{token?.name}
									</span>
									<span className="font-medium text-lg uppercase block truncate">{token?.ticker}</span>
								</div>

								<p className="text-xs text-waifufun-text-secondary break-words">
									{token?.description
										? token?.description
										: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?"}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
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
												"inline-flex items-center justify-center h-8 w-8 p-1.5 rounded-sm border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:border-[#00ff87] hover:bg-[#00ff87]/10 transition-all duration-200",
												!social?.href ? "opacity-30 cursor-not-allowed" : "opacity-70 hover:opacity-100 cursor-pointer",
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

						{/* Owner-only Update Socials button */}
						{isCreator && (
							<>
								<Button variant="outline" className="mb-2 w-fit" onClick={() => setSocialsModalOpen(true)}>
									Update Socials
								</Button>
								<UpdateSocialsModal
									open={socialsModalOpen}
									onClose={() => setSocialsModalOpen(false)}
									token={{
										chain: token.chain,
										chainId: String(token.chainId),
										contractAddress: token.contractAddress,
										socials: token.socials,
									}}
									onSuccess={() => {
										setSocialsModalOpen(false);
										query.refetch();
									}}
								/>
							</>
						)}

						<div className="h-[1px] w-full bg-[rgba(255,255,255,0.06)]" />
						<div className="flex flex-col items-start w-full gap-1 justify-between border-b ">
							<span className="text-base font-medium uppercase text-waifufun-text-secondary">TOKEN:</span>
							<div className="flex items-center w-full text-xs justify-between bg-[rgba(8,8,10,0.5)] p-2 border border-[rgba(255,255,255,0.06)] rounded-sm">
								<span className="text-gray-300 font-mono truncate">{shortenAddress(token?.contractAddress)}</span>
								<div className="flex gap-1 flex-shrink-0">
									<CopyButton textToCopy={token.contractAddress} />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			{isCreator && !token?.imported && token?.status !== "active" && <ClaimFees token={token} />}
		</div>
	);
}
