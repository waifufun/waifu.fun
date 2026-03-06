"use client";

import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { motion } from "framer-motion";
import {
	cn,
	abbreviateNumber,
	formatNumberSubscript,
	fromNow,
	shortenAddress,
} from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import Verified from "@/components/verified";
import { Badge } from "@/components/ui/badge";
import { BarChart2, Clock, Users, Star } from "lucide-react";

function HudCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
	const base = "absolute w-3 h-3 pointer-events-none";
	const styles: Record<string, string> = {
		tl: `${base} top-0 left-0 border-t border-l border-[#00ff87]/40`,
		tr: `${base} top-0 right-0 border-t border-r border-[#00ff87]/40`,
		bl: `${base} bottom-0 left-0 border-b border-l border-[#00ff87]/40`,
		br: `${base} bottom-0 right-0 border-b border-r border-[#00ff87]/40`,
	};
	return <span className={styles[position]} />;
}

function deriveAgentStatus(token: IToken) {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;
	const isDead =
		token?.status === "finalized" || (isBonded && (token?.marketcap ?? 0) === 0);
	return { isAlive: !isDead, isBonded, isDead };
}

const socialsConfig = [
	{ title: "website", hrefKey: "website" as const, icon: "/socials/website.svg" },
	{ title: "twitter", hrefKey: "twitter" as const, icon: "/socials/twitter.svg" },
	{ title: "telegram", hrefKey: "telegram" as const, icon: "/socials/telegram.svg" },
	{ title: "discord", hrefKey: "discord" as const, icon: "/socials/discord.svg" },
];

export default function AgentProfile({
	token,
	badge,
	badgeBaseClasses,
}: {
	token: IToken;
	badge: { badge: string; classes: string };
	badgeBaseClasses: string;
}) {
	const { isAlive, isDead } = deriveAgentStatus(token);

	const stats = [
		{
			label: "market cap",
			value: token?.marketcap ? `$${abbreviateNumber(token.marketcap)}` : "—",
		},
		{
			label: "holders",
			value: token?.holders ? abbreviateNumber(token.holders, true) : "—",
			icon: Users,
		},
		{
			label: "24h volume",
			value: token?.volume24h ? `$${abbreviateNumber(token.volume24h)}` : "—",
			icon: BarChart2,
		},
		{
			label: "uptime",
			value: token?.createdAt ? fromNow(token.createdAt, true) : "—",
			icon: Clock,
		},
	];

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm overflow-hidden">
			<HudCorner position="tl" />
			<HudCorner position="tr" />
			<HudCorner position="bl" />
			<HudCorner position="br" />

			{/* Identity hero: big avatar, name, tagline, status, socials */}
			<div className="p-6 md:p-8">
				<div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
					{/* Big avatar */}
					<motion.div
						className="flex-shrink-0 self-center md:self-start"
						whileHover={{ scale: 1.02 }}
						transition={{ type: "spring", stiffness: 300 }}
					>
						<div className="relative w-[160px] h-[160px] sm:w-[200px] sm:h-[200px] md:w-[220px] md:h-[220px] rounded-xl overflow-hidden border-2 border-[rgba(255,255,255,0.08)] hover:border-[#00ff87]/40 transition-colors duration-300 shadow-lg">
							<Image
								src={token.image}
								fill
								unoptimized
								alt={token.name}
								className="object-cover object-top"
								priority
								sizes="(max-width: 768px) 200px, 220px"
							/>
						</div>
					</motion.div>

					{/* Name, tagline, status, socials */}
					<div className="flex flex-col gap-3 min-w-0 flex-1 text-center md:text-left">
						{/* Name row: verified, name, ticker, status badge, bond badge */}
						<div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
							<Verified isVerified={token?.verified} />
							<h1 className="text-3xl md:text-4xl font-bold text-[#e4e4e7] lowercase tracking-tight leading-tight">
								{token.name}
							</h1>
							<span className="text-xl md:text-2xl text-[#00ff87] font-mono font-semibold">
								${token.ticker}
							</span>
							{/* Alive / Dead status */}
							<span
								className={cn(
									"inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider",
									isDead
										? "bg-red-500/20 text-red-400 border border-red-500/40"
										: "bg-[#00ff87]/20 text-[#00ff87] border border-[#00ff87]/40",
								)}
							>
								{isDead ? "Dead" : "Alive"}
							</span>
							<Badge className={cn(badgeBaseClasses, badge.classes)}>
								{badge.badge}
							</Badge>
							{token?.featured && (
								<Badge
									className={cn(
										"font-bold uppercase tracking-wider rounded-sm text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1",
										"bg-amber-400/15 text-amber-300 border border-amber-400/40",
									)}
								>
									<Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 fill-current" /> FEATURED
								</Badge>
							)}
						</div>

						{/* Personality tagline */}
						{token.description && (
							<p className="text-base text-[#a1a1aa] leading-relaxed line-clamp-2 max-w-2xl">
								{token.description}
							</p>
						)}

						{/* Socials */}
						<div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
							{socialsConfig.map((social) => {
								const href = token?.socials?.[social.hrefKey];
								const hasLink = !!href;
								const Comp = hasLink ? Link : Fragment;
								const compProps: { key?: string; href?: string; target?: string } = {};
								if (hasLink && href) {
									compProps.href = href;
									compProps.target = "_blank";
								}
								return (
									<Fragment key={social.title}>
										{/* @ts-expect-error Comp is Link or Fragment */}
										<Comp {...compProps}>
											<Image
											src={social.icon}
											className={cn(
												"inline-flex items-center justify-center h-8 w-8 p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[#00ff87]/50 hover:bg-[#00ff87]/10 transition-all duration-200",
												!href
													? "opacity-30 cursor-not-allowed"
													: "opacity-70 hover:opacity-100 cursor-pointer",
											)}
											unoptimized
											width={24}
											height={24}
											alt={social.title}
										/>
										</Comp>
									</Fragment>
								);
							})}
						</div>

						{/* Creator */}
						<div className="flex items-center justify-center md:justify-start gap-2 text-xs">
							<span className="text-[#52525b] font-mono uppercase">created by</span>
							<Link
								href={`/profile/${token.creator}`}
								className="text-[#a1a1aa] hover:text-[#00ff87] font-mono transition-colors"
							>
								{token?.creator ? shortenAddress(token.creator) : "—"}
							</Link>
							{token?.creator && <CopyButton textToCopy={token.creator} />}
						</div>
					</div>
				</div>
			</div>

			{/* Stats strip */}
			<div className="border-t border-[rgba(255,255,255,0.06)] px-6 md:px-8 py-4 bg-[#08080a]/60">
				<div className="flex flex-wrap gap-x-8 gap-y-3 justify-center md:justify-start">
					{stats.map((s) => (
						<div key={s.label} className="flex flex-col gap-0.5">
							<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
								{s.label}
							</span>
							<span className="text-sm text-[#e4e4e7] font-mono font-medium inline-flex items-center gap-1.5">
								{s.icon && <s.icon className="size-3.5 text-[#00ff87]/60 flex-shrink-0" />}
								{s.value}
							</span>
						</div>
					))}
					{/* Price in stats strip for consistency */}
					<div className="flex flex-col gap-0.5">
						<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
							price
						</span>
						<span className="text-sm text-[#e4e4e7] font-mono font-medium">
							{formatNumberSubscript(token?.price)}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
