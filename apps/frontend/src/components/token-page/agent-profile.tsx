"use client";

import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { BarChart2, Clock, Star, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import Verified from "@/components/verified";
import { abbreviateNumber, cn, formatNumberSubscript, fromNow, shortenAddress } from "@/lib/utils";

export type AgentLifecycleState = "bonding" | "active" | "dormant" | "imported";

export interface AgentLifecycleStatus {
	state: AgentLifecycleState;
	label: AgentLifecycleState;
	isBonded: boolean;
	isImported: boolean;
	hasRecentActivity: boolean;
}

const ACTIVE_MARKETCAP_THRESHOLD = 1_000;

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

function isImportedToken(token: IToken) {
	const tokenWithOrigin = token as IToken & { origin?: string };
	return Boolean(token?.imported) || tokenWithOrigin?.origin === "imported";
}

export function deriveAgentLifecycleStatus(token: IToken): AgentLifecycleStatus {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = Boolean(token?.curveCompleted) || curveProgress >= 100;
	const isImported = isImportedToken(token);
	const volume24h = Number(token?.volume24h ?? 0);
	const marketcap = Number(token?.marketcap ?? 0);
	const isFinalized = token?.status === "finalized";
	const hasRecentActivity = volume24h > 0 || marketcap >= ACTIVE_MARKETCAP_THRESHOLD;

	if (isImported) {
		return {
			state: "imported",
			label: "imported",
			isBonded,
			isImported,
			hasRecentActivity,
		};
	}

	if (isFinalized) {
		return {
			state: "dormant",
			label: "dormant",
			isBonded,
			isImported,
			hasRecentActivity: false,
		};
	}

	if (!isBonded) {
		return {
			state: "bonding",
			label: "bonding",
			isBonded,
			isImported,
			hasRecentActivity,
		};
	}

	if (hasRecentActivity) {
		return {
			state: "active",
			label: "active",
			isBonded,
			isImported,
			hasRecentActivity,
		};
	}

	return {
		state: "dormant",
		label: "dormant",
		isBonded,
		isImported,
		hasRecentActivity,
	};
}

function AnimatedCounter({ value }: { value: string }) {
	const [displayed, setDisplayed] = useState(value);

	useEffect(() => {
		setDisplayed(value);
	}, [value]);

	return (
		<motion.span
			key={value}
			initial={{ opacity: 0.5, y: 2 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="inline-flex"
		>
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

const statusClassMap: Record<AgentLifecycleState, string> = {
	bonding: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
	active: "bg-[#00ff87]/15 text-[#00ff87] border border-[#00ff87]/30",
	dormant: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
	imported: "bg-sky-500/15 text-[#60a5fa] border border-sky-500/30",
};

export default function AgentProfile({
	token,
	status,
	badge,
	badgeBaseClasses,
}: {
	token: IToken;
	status: AgentLifecycleStatus;
	badge: { badge: string; classes: string };
	badgeBaseClasses: string;
}) {
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
	const statusClass = statusClassMap[status.state];

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-5 md:p-6 overflow-hidden">
			<div className="absolute -top-20 -left-20 w-40 h-40 bg-[#00ff87]/5 blur-3xl rounded-full pointer-events-none" />
			<div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#c084fc]/5 blur-3xl rounded-full pointer-events-none" />

			<HudCorner position="tl" />
			<HudCorner position="tr" />
			<HudCorner position="bl" />
			<HudCorner position="br" />

			<div className="relative flex flex-col md:flex-row gap-5 md:gap-6">
				<motion.div
					className="flex-shrink-0 self-start relative"
					whileHover={{ scale: 1.03 }}
					transition={{ type: "spring", stiffness: 300 }}
				>
					<div className="absolute inset-0 bg-gradient-to-br from-[#00ff87]/20 via-transparent to-[#c084fc]/10 blur-xl rounded-sm scale-110 opacity-60" />
					<div className="relative w-[140px] h-[140px] md:w-[180px] md:h-[180px] rounded-sm overflow-hidden border border-[#00ff87]/30 hover:border-[#00ff87]/60 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,135,0.2)]">
						<Image
							src={token.image}
							fill
							unoptimized
							alt={token.name}
							className="object-cover object-top"
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/40 via-transparent to-transparent" />
					</div>
				</motion.div>

				<div className="flex flex-col gap-3 min-w-0 flex-1">
					<div className="flex items-center gap-2.5 flex-wrap">
						<Verified isVerified={token?.verified} />
						<h1 className="text-2xl md:text-3xl font-bold text-[#e4e4e7] lowercase tracking-wide leading-tight">
							{token.name}
						</h1>
						{status.state === "active" && <LiveDot />}
						<span className="text-lg md:text-xl text-[#00ff87] font-mono font-semibold">${token.ticker}</span>
						<span className={cn("px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider", statusClass)}>
							{status.label}
						</span>
						<Badge className={cn(badgeBaseClasses, badge.classes)}>{badge.badge}</Badge>
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

					{token.description && (
						<p className="text-sm text-[#a1a1aa] leading-relaxed line-clamp-2 max-w-2xl">{token.description}</p>
					)}

					<div className="flex items-center gap-2 text-xs">
						<span className="text-[#52525b] font-mono uppercase">created by</span>
						<Link
							href={`/profile/${token.creator}`}
							className="text-[#a1a1aa] hover:text-[#00ff87] font-mono transition-colors"
						>
							{token?.creator ? shortenAddress(token.creator) : "—"}
						</Link>
						{token?.creator && <CopyButton textToCopy={token.creator} />}
					</div>

					<div
						className="relative flex gap-2 mt-1 overflow-x-auto pb-1 scrollbar-hide md:flex-wrap md:overflow-visible"
						style={{ WebkitOverflowScrolling: "touch" }}
					>
						{stats.map((stat, index) => (
							<motion.div
								key={stat.label}
								className="relative flex-shrink-0 flex flex-col gap-0.5 py-2.5 px-3 bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(255,255,255,0.12)] transition-colors group"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: index * 0.05 }}
							>
								<span className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-[#00ff87]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
								<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider inline-flex items-center gap-1">
									{stat.live && <span className="h-1 w-1 rounded-full bg-[#00ff87] animate-pulse" />}
									{stat.label}
								</span>
								<span className="text-sm text-[#e4e4e7] font-mono font-medium inline-flex items-center gap-1">
									{stat.icon && <stat.icon className="size-3 text-[#00ff87]/60" />}
									<AnimatedCounter value={stat.value} />
								</span>
							</motion.div>
						))}
					</div>

					<div className="flex items-center gap-2 mt-1">
						{socials.map((social, index) => {
							const hasLink = !!social.href;
							const Comp = hasLink ? Link : Fragment;
							const compProps: { key: string; href?: string; target?: string } = { key: social.title };

							if (hasLink && social.href) {
								compProps.href = social.href;
								compProps.target = "_blank";
							}

							return (
								// @ts-expect-error Comp is Link or Fragment.
								<Comp {...compProps} key={social.title}>
									<motion.div
										initial={{ opacity: 0, scale: 0.8 }}
										animate={{ opacity: 1, scale: 1 }}
										transition={{ delay: 0.2 + index * 0.05 }}
									>
										<Image
											src={social.icon}
											className={cn(
												"inline-flex items-center justify-center h-7 w-7 p-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[#00ff87] hover:bg-[#00ff87]/10 transition-all duration-200",
												!social.href
													? "opacity-25 cursor-not-allowed"
													: "opacity-60 hover:opacity-100 cursor-pointer hover:shadow-[0_0_12px_rgba(0,255,135,0.15)]",
											)}
											unoptimized
											width={24}
											height={24}
											alt={social.title}
										/>
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
