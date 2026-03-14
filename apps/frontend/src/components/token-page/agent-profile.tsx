"use client";

import { CopyButton } from "@/components/copy-button";
import Verified from "@/components/verified";
import { cn, shortenAddress } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

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

const displayStatusConfig: Record<AgentDisplayStatus, { className: string; pulse: boolean }> = {
	alive: { className: "bg-[#00ff87] shadow-[0_0_12px_rgba(0,255,135,0.4)]", pulse: true },
	asleep: { className: "bg-zinc-500", pulse: false },
	dead: { className: "bg-red-500/60", pulse: false },
};

const socialsConfig = [
	{ key: "website", icon: "/socials/website.svg" },
	{ key: "twitter", icon: "/socials/twitter.svg" },
	{ key: "telegram", icon: "/socials/telegram.svg" },
	{ key: "discord", icon: "/socials/discord.svg" },
] as const;

export default function AgentProfile({
	token,
	status,
	headerAccessory,
}: {
	token: IToken;
	status: AgentLifecycleStatus;
	marketDataSource?: "dexscreener" | null;
	headerAccessory?: ReactNode;
}) {
	const displayStatus = getAgentDisplayStatus(token, status);
	const statusConfig = displayStatusConfig[displayStatus];
	const isLive = status.state === "active" || (status.isExternalMarket && status.hasRecentActivity);

	const socialsWithLinks = socialsConfig
		.map((s) => ({
			...s,
			href: token?.socials?.[s.key as keyof typeof token.socials] as string | undefined,
		}))
		.filter((s): s is typeof s & { href: string } => Boolean(s.href));

	return (
		<div className="relative">
			{/* Ambient glow behind the card */}
			<div className="absolute -inset-4 bg-gradient-to-br from-[#00ff87]/[0.02] via-transparent to-[#c084fc]/[0.02] blur-2xl pointer-events-none" />

			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
				className="relative"
			>
				{/* Main hero container */}
				<div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:gap-8">
					{/* Agent portrait - gallery style */}
					<div className="relative mx-auto lg:mx-0">
						<motion.div
							className="relative"
							whileHover={{ scale: 1.02 }}
							transition={{ type: "spring", stiffness: 400, damping: 25 }}
						>
							{/* Portrait frame */}
							<div className="relative h-[200px] w-[200px] sm:h-[240px] sm:w-[240px] lg:h-[280px] lg:w-[280px] overflow-hidden rounded-sm">
								{/* Subtle gradient border effect */}
								<div className="absolute inset-0 rounded-sm bg-gradient-to-br from-[#00ff87]/20 via-transparent to-[#c084fc]/10 p-px">
									<div className="h-full w-full rounded-sm bg-[#08080a] overflow-hidden">
										<Image
											src={token.image}
											fill
											unoptimized
											alt={token.name}
											className="object-cover object-top"
											priority
										/>
										{/* Vignette overlay */}
										<div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/60 via-transparent to-transparent" />
									</div>
								</div>

								{/* Status indicator - positioned at bottom right */}
								<div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-sm bg-[#08080a]/80 backdrop-blur-sm px-2.5 py-1.5 border border-white/5">
									<span className="relative flex h-2.5 w-2.5">
										{statusConfig.pulse && (
											<span
												className={cn(
													"absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping",
													statusConfig.className,
												)}
											/>
										)}
										<span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", statusConfig.className)} />
									</span>
									<span className="text-[10px] font-mono uppercase tracking-wider text-[#e4e4e7]">{displayStatus}</span>
								</div>
							</div>
						</motion.div>
					</div>

					{/* Identity and meta */}
					<div className="flex flex-col gap-4 min-w-0">
						{/* Name row */}
						<div className="flex flex-col gap-2">
							<div className="flex items-start gap-3 flex-wrap">
								<div className="flex items-center gap-2 min-w-0">
									<Verified isVerified={token?.verified} />
									<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#f4f4f5] lowercase tracking-tight leading-none break-words">
										{token.name}
									</h1>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-lg sm:text-xl lg:text-2xl text-[#00ff87] font-mono font-semibold">
										${token.ticker}
									</span>
									{isLive && (
										<span className="h-1.5 w-1.5 rounded-full bg-[#00ff87] animate-pulse shadow-[0_0_6px_rgba(0,255,135,0.5)]" />
									)}
								</div>
							</div>

							{/* Tagline / description */}
							{token.description && (
								<p className="max-w-2xl text-sm leading-relaxed text-[#a1a1aa] mt-1">{token.description}</p>
							)}
						</div>

						{/* Creator and socials row */}
						<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
							{token?.creator && (
								<div className="flex items-center gap-1.5">
									<span className="font-mono uppercase tracking-wider text-[#52525b]">by</span>
									<Link
										href={`/profile/${token.creator}`}
										className="font-mono text-[#a1a1aa] hover:text-[#00ff87] transition-colors"
									>
										{shortenAddress(token.creator)}
									</Link>
									<CopyButton textToCopy={token.creator} />
								</div>
							)}

							{socialsWithLinks.length > 0 && (
								<div className="flex items-center gap-2">
									{socialsWithLinks.map((social) => (
										<Link
											key={social.key}
											href={social.href}
											target="_blank"
											rel="noopener noreferrer"
											className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/6 bg-white/[0.02] opacity-60 transition-all duration-200 hover:border-[#00ff87]/30 hover:bg-[#00ff87]/5 hover:opacity-100"
										>
											<Image
												src={social.icon}
												unoptimized
												width={14}
												height={14}
												alt={social.key}
												className="opacity-80"
											/>
										</Link>
									))}
								</div>
							)}

							{token?.contractAddress && (
								<Link
									href={`https://basescan.org/address/${token.contractAddress}`}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-1 font-mono text-[#52525b] hover:text-[#a1a1aa] transition-colors"
								>
									<span>{shortenAddress(token.contractAddress)}</span>
									<ExternalLink className="size-3" />
								</Link>
							)}
						</div>

						{/* View mode toggle - placed here in the identity area */}
						{headerAccessory && <div className="mt-auto pt-2">{headerAccessory}</div>}
					</div>
				</div>
			</motion.div>
		</div>
	);
}
