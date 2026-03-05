"use client";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn, abbreviateNumber, formatNumberSubscript, fromNow, shortenAddress } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import Verified from "@/components/verified";
import { Badge } from "@/components/ui/badge";
import { BarChart2, Clock, Star, Users } from "lucide-react";

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

function AnimatedCounter({ value }: { value: string }) {
	const [displayed, setDisplayed] = useState(value);
	useEffect(() => { setDisplayed(value); }, [value]);
	return (
		<motion.span key={value} initial={{ opacity: 0.5, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="inline-flex">
			{displayed}
		</motion.span>
	);
}

function LiveDot() {
	return (
		<span className="relative flex h-2 w-2">
			<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff87] opacity-75" />
			<span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff87] shadow-[0_0_8px_rgba(0,255,135,0.6)]" />
		</span>
	);
}

export default function AgentProfile({ token, badge, badgeBaseClasses }: { token: IToken; badge: { badge: string; classes: string }; badgeBaseClasses: string }) {
	const stats = [
		{ label: "mkt cap", value: token?.marketcap ? `$${abbreviateNumber(token.marketcap)}` : "—", live: true },
		{ label: "24h vol", value: token?.volume24h ? `$${abbreviateNumber(token.volume24h)}` : "—", icon: BarChart2 },
		{ label: "holders", value: token?.holders ? abbreviateNumber(token.holders, true) : "—", icon: Users },
		{ label: "price", value: formatNumberSubscript(token?.price), live: true },
		{ label: "age", value: token?.createdAt ? fromNow(token.createdAt, true) : "—", icon: Clock },
	];

	const socials = [
		{ title: "website", href: token?.socials?.website, icon: "/socials/website.svg" },
		{ title: "twitter", href: token?.socials?.twitter, icon: "/socials/twitter.svg" },
		{ title: "telegram", href: token?.socials?.telegram, icon: "/socials/telegram.svg" },
		{ title: "discord", href: token?.socials?.discord, icon: "/socials/discord.svg" },
	];

	const isActive = token?.status === "active" || badge.badge === "ACTIVE";

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-5 md:p-6 overflow-hidden">
			{/* Subtle ambient glow */}
			<div className="absolute -top-20 -left-20 w-40 h-40 bg-[#00ff87]/5 blur-3xl rounded-full pointer-events-none" />
			<div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#c084fc]/5 blur-3xl rounded-full pointer-events-none" />
			
			<HudCorner position="tl" />
			<HudCorner position="tr" />
			<HudCorner position="bl" />
			<HudCorner position="br" />

			<div className="relative flex flex-col md:flex-row gap-5 md:gap-6">
				{/* agent image with glow */}
				<motion.div className="flex-shrink-0 self-start relative" whileHover={{ scale: 1.03 }} transition={{ type: "spring", stiffness: 300 }}>
					<div className="absolute inset-0 bg-gradient-to-br from-[#00ff87]/20 via-transparent to-[#c084fc]/10 blur-xl rounded-sm scale-110 opacity-60" />
					<div className="relative w-[140px] h-[140px] md:w-[180px] md:h-[180px] rounded-sm overflow-hidden border border-[#00ff87]/30 hover:border-[#00ff87]/60 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,135,0.2)]">
						<Image src={token.image} fill unoptimized alt={token.name} className="object-cover object-top" />
						<div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/40 via-transparent to-transparent" />
					</div>
				</motion.div>

				{/* info column */}
				<div className="flex flex-col gap-3 min-w-0 flex-1">
					<div className="flex items-center gap-2.5 flex-wrap">
						<Verified isVerified={token?.verified} />
						<h1 className="text-2xl md:text-3xl font-bold text-[#e4e4e7] lowercase tracking-wide leading-tight">{token.name}</h1>
						{isActive && <LiveDot />}
						<span className="text-lg md:text-xl text-[#00ff87] font-mono font-semibold">{token.ticker}</span>
						<Badge className={cn(badgeBaseClasses, badge.classes)}>{badge.badge}</Badge>
						{token?.featured && (
							<Badge className={cn("font-bold uppercase tracking-wider rounded-sm text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1", "bg-amber-400/15 text-amber-300 border border-amber-400/40")}>
								<Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 fill-current" /> FEATURED
							</Badge>
						)}
					</div>

					{token.description && <p className="text-sm text-[#a1a1aa] leading-relaxed line-clamp-2 max-w-2xl">{token.description}</p>}

					<div className="flex items-center gap-2 text-xs">
						<span className="text-[#52525b] font-mono uppercase">created by</span>
						<Link href={`/profile/${token.creator}`} className="text-[#a1a1aa] hover:text-[#00ff87] font-mono transition-colors">
							{token?.creator ? shortenAddress(token.creator) : "—"}
						</Link>
						{token?.creator && <CopyButton textToCopy={token.creator} />}
					</div>

					{/* stats strip - enhanced */}
					<div className="relative flex flex-wrap gap-x-1 gap-y-2 mt-1">
						{stats.map((s, i) => (
							<motion.div key={s.label} className="relative flex flex-col gap-0.5 py-2.5 px-3 bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(255,255,255,0.12)] transition-colors group" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
								<span className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider inline-flex items-center gap-1">
									{s.live && <span className="h-1 w-1 rounded-full bg-[#00ff87] animate-pulse" />}
									{s.label}
								</span>
								<span className="text-sm text-[#e4e4e7] font-mono font-medium inline-flex items-center gap-1">
									{s.icon && <s.icon className="size-3 text-[#00ff87]/60" />}
									<AnimatedCounter value={s.value} />
								</span>
							</motion.div>
						))}
					</div>

					{/* socials */}
					<div className="flex items-center gap-2 mt-1">
						{socials.map((social, i) => {
							const hasLink = !!social.href;
							const Comp = hasLink ? Link : Fragment;
							const compProps: { key: string; href?: string; target?: string } = { key: social.title };
							if (hasLink && social.href) { compProps.href = social.href; compProps.target = "_blank"; }
							return (
								// @ts-ignore
								<Comp {...compProps} key={social.title}>
									<motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.05 }}>
										<Image src={social.icon} className={cn("inline-flex items-center justify-center h-7 w-7 p-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[#00ff87] hover:bg-[#00ff87]/10 transition-all duration-200", !social.href ? "opacity-25 cursor-not-allowed" : "opacity-60 hover:opacity-100 cursor-pointer hover:shadow-[0_0_12px_rgba(0,255,135,0.15)]")} unoptimized width={24} height={24} alt={social.title} />
									</motion.div>
								</Comp>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
