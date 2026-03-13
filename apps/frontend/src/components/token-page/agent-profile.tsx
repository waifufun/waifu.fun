"use client";

import { CopyButton } from "@/components/copy-button";
import Verified from "@/components/verified";
import { abbreviateNumber, cn, formatNumberSubscript, shortenAddress } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { BarChart2, DollarSign, TrendingUp, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export type AgentLifecycleState = "bonding" | "active" | "dormant" | "imported" | "migrated";

export interface AgentLifecycleStatus {
	state: AgentLifecycleState;
	label: AgentLifecycleState;
	isBonded: boolean;
	isImported: boolean;
	isExternalMarket: boolean;
	isStatusExternalMarket: boolean;
	hasExternalPool: boolean;
	hasCompletedBondingCurve: boolean;
	hasRecentActivity: boolean;
}

const ACTIVE_MARKETCAP_THRESHOLD = 1_000;
const externalMarketStatuses = new Set(["migrated", "dex", "locked"]);

type TokenLifecycleHints = IToken & { origin?: string; pool?: string | null };

function isImportedToken(token: IToken) {
	const tokenWithOrigin = token as TokenLifecycleHints;
	return Boolean(token?.imported) || tokenWithOrigin?.origin === "imported";
}

function hasExternalPoolAddress(pool: string | null | undefined) {
	if (!pool) return false;
	const normalizedPool = pool.trim();
	return /^0x[a-fA-F0-9]{40}$/.test(normalizedPool) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalizedPool);
}

function getLifecycleSignals(token: IToken) {
	const tokenWithHints = token as TokenLifecycleHints;
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const normalizedStatus = String(token?.status ?? "")
		.trim()
		.toLowerCase();
	const isImported = isImportedToken(token);
	const isStatusExternalMarket = externalMarketStatuses.has(normalizedStatus);
	const hasExternalPool = hasExternalPoolAddress(tokenWithHints?.pool);
	const hasCompletedBondingCurve = Boolean(token?.curveCompleted) || curveProgress >= 100;
	const volume24h = Number(token?.volume24h ?? 0);
	const marketcap = Number(token?.marketcap ?? 0);
	const isFinalized = normalizedStatus === "finalized";
	const hasRecentActivity = volume24h > 0 || marketcap >= ACTIVE_MARKETCAP_THRESHOLD;
	const isExternalMarket = isImported || isStatusExternalMarket || hasExternalPool;
	const isBonded = hasCompletedBondingCurve || isExternalMarket;

	return {
		isImported,
		isStatusExternalMarket,
		hasExternalPool,
		hasCompletedBondingCurve,
		hasRecentActivity,
		isExternalMarket,
		isBonded,
		isFinalized,
	};
}

export function deriveAgentLifecycleStatus(token: IToken): AgentLifecycleStatus {
	const {
		isImported,
		isStatusExternalMarket,
		hasExternalPool,
		hasCompletedBondingCurve,
		hasRecentActivity,
		isExternalMarket,
		isBonded,
		isFinalized,
	} = getLifecycleSignals(token);

	if (isImported) {
		return {
			state: "imported",
			label: "imported",
			isBonded: true,
			isImported,
			isExternalMarket,
			isStatusExternalMarket,
			hasExternalPool,
			hasCompletedBondingCurve,
			hasRecentActivity,
		};
	}
	if (isStatusExternalMarket) {
		return {
			state: "migrated",
			label: "migrated",
			isBonded: true,
			isImported,
			isExternalMarket,
			isStatusExternalMarket,
			hasExternalPool,
			hasCompletedBondingCurve,
			hasRecentActivity,
		};
	}
	if (isFinalized) {
		return {
			state: "dormant",
			label: "dormant",
			isBonded,
			isImported,
			isExternalMarket,
			isStatusExternalMarket,
			hasExternalPool,
			hasCompletedBondingCurve,
			hasRecentActivity: false,
		};
	}
	if (!isBonded) {
		return {
			state: "bonding",
			label: "bonding",
			isBonded,
			isImported,
			isExternalMarket,
			isStatusExternalMarket,
			hasExternalPool,
			hasCompletedBondingCurve,
			hasRecentActivity,
		};
	}
	if (hasRecentActivity) {
		return {
			state: "active",
			label: "active",
			isBonded,
			isImported,
			isExternalMarket,
			isStatusExternalMarket,
			hasExternalPool,
			hasCompletedBondingCurve,
			hasRecentActivity,
		};
	}
	return {
		state: "dormant",
		label: "dormant",
		isBonded,
		isImported,
		isExternalMarket,
		isStatusExternalMarket,
		hasExternalPool,
		hasCompletedBondingCurve,
		hasRecentActivity,
	};
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
	migrated: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
};

export type AgentDisplayStatus = "alive" | "asleep" | "dead";

export function getAgentDisplayStatus(token: IToken, status: AgentLifecycleStatus): AgentDisplayStatus {
	const isFinalized =
		String(token?.status ?? "")
			.trim()
			.toLowerCase() === "finalized";
	const isBondedZeroCap = status.isBonded && !status.isExternalMarket && Number(token?.marketcap ?? 0) === 0;
	if (isFinalized || isBondedZeroCap) return "dead";
	if (status.state === "bonding" || status.state === "active") return "alive";
	if (status.isExternalMarket && status.hasRecentActivity) return "alive";
	return "asleep";
}

const displayStatusClass: Record<AgentDisplayStatus, string> = {
	alive: "bg-[#00ff87]/15 text-[#00ff87] border-[#00ff87]/40",
	asleep: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
	dead: "bg-red-500/15 text-red-400 border-red-500/40",
};

const statIcons = { price: DollarSign, "mkt cap": TrendingUp, "24h vol": BarChart2, holders: Users };

export default function AgentProfile({
	token,
	status,
	marketDataSource,
}: {
	token: IToken;
	status: AgentLifecycleStatus;
	marketDataSource?: "dexscreener" | null;
}) {
	const hasLiveExternalMarketData = marketDataSource === "dexscreener";
	const stats: { label: string; value: string; live?: boolean }[] = [
		{
			label: "price",
			value: formatNumberSubscript(token?.price),
			live: hasLiveExternalMarketData || !status.isExternalMarket,
		},
		{
			label: "mkt cap",
			value: token?.marketcap ? `$${abbreviateNumber(token.marketcap)}` : "—",
			live: hasLiveExternalMarketData || !status.isExternalMarket,
		},
		{
			label: "24h vol",
			value: token?.volume24h ? `$${abbreviateNumber(token.volume24h)}` : "—",
			live: hasLiveExternalMarketData,
		},
		{ label: "holders", value: token?.holders ? abbreviateNumber(token.holders, true) : "—" },
	];

	const socialsWithLinks = [
		{ title: "website", href: token?.socials?.website, icon: "/socials/website.svg" },
		{ title: "twitter", href: token?.socials?.twitter, icon: "/socials/twitter.svg" },
		{ title: "telegram", href: token?.socials?.telegram, icon: "/socials/telegram.svg" },
		{ title: "discord", href: token?.socials?.discord, icon: "/socials/discord.svg" },
	].filter((s): s is typeof s & { href: string } => Boolean(s.href));

	const statusClass = statusClassMap[status.state];
	const displayStatus = getAgentDisplayStatus(token, status);

	return (
		<div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 sm:p-5 md:p-6 overflow-hidden">
			<div className="absolute -top-20 -left-20 w-40 h-40 bg-[#00ff87]/5 blur-3xl rounded-full pointer-events-none" />
			<div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#c084fc]/5 blur-3xl rounded-full pointer-events-none" />

			{/* Top-right status: alive / asleep / dead */}
			<div
				className={cn(
					"absolute top-3 right-3 sm:top-4 sm:right-4 z-10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-sm border text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0",
					displayStatusClass[displayStatus],
				)}
				aria-label={`Agent status: ${displayStatus}`}
			>
				{displayStatus}
			</div>

			<div className="relative flex flex-col sm:flex-row gap-4 sm:gap-5 md:gap-6 min-w-0">
				<motion.div
					className="flex-shrink-0 self-start relative mx-auto sm:mx-0"
					whileHover={{ scale: 1.03 }}
					transition={{ type: "spring", stiffness: 300 }}
				>
					<div className="absolute inset-0 bg-gradient-to-br from-[#00ff87]/20 via-transparent to-[#c084fc]/10 blur-xl rounded-sm scale-110 opacity-60" />
					<div className="relative w-[100px] h-[100px] sm:w-[140px] sm:h-[140px] md:w-[180px] md:h-[180px] rounded-sm overflow-hidden border border-[#00ff87]/30 hover:border-[#00ff87]/60 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,135,0.2)]">
						<Image src={token.image} fill unoptimized alt={token.name} className="object-cover object-top" />
						<div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/40 via-transparent to-transparent" />
					</div>
				</motion.div>

				<div className="flex flex-col gap-2 sm:gap-3 min-w-0 flex-1 pr-14 sm:pr-16">
					<div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
						<Verified isVerified={token?.verified} />
						<h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#e4e4e7] lowercase tracking-wide leading-tight break-words min-w-0">
							{token.name}
						</h1>
						{(status.state === "active" || (status.isExternalMarket && status.hasRecentActivity)) && <LiveDot />}
						<span className="text-lg md:text-xl text-[#00ff87] font-mono font-semibold">${token.ticker}</span>
						<span className={cn("px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider", statusClass)}>
							{status.label}
						</span>
					</div>

					{token.description && (
						<p className="text-xs sm:text-sm text-[#a1a1aa] leading-relaxed line-clamp-2 max-w-2xl min-w-0">
							{token.description}
						</p>
					)}

					<div className="flex items-center gap-2 text-xs">
						<span className="text-[#71717a] font-mono uppercase">created by</span>
						<Link
							href={`/profile/${token.creator}`}
							className="text-[#a1a1aa] hover:text-[#00ff87] font-mono transition-colors"
						>
							{token?.creator ? shortenAddress(token.creator) : "—"}
						</Link>
						{token?.creator && <CopyButton textToCopy={token.creator} />}
					</div>

					<div
						className="relative flex gap-1.5 mt-1 overflow-x-auto pb-1 scrollbar-hide md:flex-wrap md:overflow-visible min-w-0 -mx-1 px-1"
						style={{ WebkitOverflowScrolling: "touch" }}
					>
						{stats.map((stat) => {
							const Icon = statIcons[stat.label as keyof typeof statIcons];
							return (
								<div
									key={stat.label}
									className="relative flex-shrink-0 flex flex-col gap-0.5 py-1.5 px-2 bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm hover:border-[rgba(255,255,255,0.12)] transition-colors min-w-0"
								>
									<span className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider inline-flex items-center gap-1">
										{stat.live && <span className="h-1 w-1 rounded-full bg-[#00ff87] animate-pulse" />}
										{stat.label}
									</span>
									<span className="text-sm text-[#e4e4e7] font-mono font-medium inline-flex items-center gap-1">
										{Icon && <Icon className="size-3 text-[#00ff87]/60" />}
										{stat.value}
									</span>
								</div>
							);
						})}
					</div>

					{socialsWithLinks.length > 0 && (
						<div className="flex items-center gap-2 mt-1 flex-wrap">
							{socialsWithLinks.map((social) => (
								<Link key={social.title} href={social.href} target="_blank" rel="noopener noreferrer">
									<Image
										src={social.icon}
										className="inline-flex items-center justify-center h-7 w-7 p-1.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] opacity-60 hover:opacity-100 cursor-pointer hover:border-[#00ff87] hover:bg-[#00ff87]/10 transition-all duration-200 hover:shadow-[0_0_12px_rgba(0,255,135,0.15)]"
										unoptimized
										width={24}
										height={24}
										alt={social.title}
									/>
								</Link>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
