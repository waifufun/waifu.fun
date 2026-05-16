"use client";

import { CopyButton } from "@/components/copy-button";
import Verified from "@/components/verified";
import { getExplorerAddressUrl } from "@/lib/explorer";
import { sanitizeExternalUrl } from "@/lib/url-safety";
import { cn, fromNow, shortenAddress } from "@/lib/utils";
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

/** Presence status labels for the agent page. */
const presenceLabels: Record<AgentLifecycleState, string> = {
	bonding: "emerging",
	active: "online",
	dormant: "idle",
	imported: "tracked",
	migrated: "graduated",
};

/** Accent color per presence state for the breathing dot. */
const presenceDotColor: Record<AgentLifecycleState, string> = {
	bonding: "bg-amber-400",
	active: "bg-[#00ff87]",
	dormant: "bg-zinc-500",
	imported: "bg-sky-400",
	migrated: "bg-violet-400",
};

const presenceDotGlow: Record<AgentLifecycleState, string> = {
	bonding: "shadow-[0_0_8px_rgba(251,191,36,0.35)]",
	active: "shadow-[0_0_8px_rgba(0,255,135,0.35)]",
	dormant: "",
	imported: "shadow-[0_0_8px_rgba(56,189,248,0.25)]",
	migrated: "shadow-[0_0_8px_rgba(139,92,246,0.25)]",
};

const presenceLabelColor: Record<AgentLifecycleState, string> = {
	bonding: "text-amber-400",
	active: "text-[#00ff87]",
	dormant: "text-zinc-500",
	imported: "text-sky-400",
	migrated: "text-violet-400",
};

type RuntimeToken = IToken & {
	lastHeartbeatAt?: string | Date | null;
	lastActivityAt?: string | Date | null;
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
	const isLive = status.state === "active" || (status.isExternalMarket && status.hasRecentActivity);
	const runtimeToken = token as RuntimeToken;
	const lastActivity = runtimeToken.lastActivityAt ? fromNow(runtimeToken.lastActivityAt) : null;
	const lastHeartbeat = runtimeToken.lastHeartbeatAt ? fromNow(runtimeToken.lastHeartbeatAt) : null;
	const recentTimeLabel = lastActivity ?? lastHeartbeat;

	const socialsWithLinks = socialsConfig
		.map((s) => ({
			...s,
			href: sanitizeExternalUrl(token?.socials?.[s.key as keyof typeof token.socials] as string | undefined),
		}))
		.filter((s): s is typeof s & { href: string } => Boolean(s.href));

	return (
		<motion.div
			initial={{ opacity: 0, y: 14 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 120, damping: 22 }}
			className="relative"
		>
			{/* Main hero grid: portrait left, identity right */}
			<div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:gap-12">
				{/* Agent portrait: gallery framing */}
				<div className="relative mx-auto lg:mx-0">
					<motion.div
						className="relative"
						whileHover={{ scale: 1.015 }}
						transition={{ type: "spring", stiffness: 300, damping: 25 }}
					>
						<div className="relative h-[240px] w-[240px] sm:h-[280px] sm:w-[280px] lg:h-[340px] lg:w-[340px] overflow-hidden rounded-sm">
							{/* Thin accent border - gallery style */}
							<div className="absolute inset-0 rounded-sm ring-1 ring-white/[0.06] overflow-hidden">
								<Image
									src={token.image}
									fill
									unoptimized
									alt={token.name}
									className="object-cover object-top"
									priority
								/>
								{/* Soft vignette at base */}
								<div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/50 via-transparent to-transparent" />
							</div>
						</div>
					</motion.div>
				</div>

				{/* Identity block */}
				<div className="flex flex-col gap-5 min-w-0 pt-1">
					{/* Name + presence */}
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-3 flex-wrap">
							{/* Presence dot + label inline with name */}
							<span className="relative flex h-2.5 w-2.5 shrink-0">
								{isLive && (
									<span
										className={cn(
											"absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping",
											presenceDotColor[status.state],
										)}
									/>
								)}
								<span
									className={cn(
										"relative inline-flex h-2.5 w-2.5 rounded-full",
										presenceDotColor[status.state],
										presenceDotGlow[status.state],
									)}
								/>
							</span>

							<div className="flex items-center gap-2.5 min-w-0">
								<Verified isVerified={token?.verified} />
								<h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#f4f4f5] lowercase tracking-tighter leading-none break-words">
									{token.name}
								</h1>
							</div>

							<span className="text-base sm:text-lg text-zinc-600 font-mono font-medium tracking-tight">
								${token.ticker}
							</span>
						</div>

						{/* Status text + last seen */}
						<div className="flex items-center gap-3 text-[11px] font-mono">
							<span className={cn("lowercase tracking-wide", presenceLabelColor[status.state])}>
								{presenceLabels[status.state]}
							</span>
							{recentTimeLabel && (
								<>
									<span className="text-zinc-800">|</span>
									<span className="text-zinc-600 tracking-wider">{recentTimeLabel}</span>
								</>
							)}
						</div>
					</div>

					{/* Bio / description: prominent, first content */}
					{token.description && <p className="max-w-xl text-sm leading-relaxed text-zinc-400">{token.description}</p>}

					{/* Creator + socials + contract: metadata row */}
					<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] mt-auto">
						{token?.creator && (
							<div className="flex items-center gap-1.5">
								<span className="font-mono uppercase tracking-wider text-zinc-700">by</span>
								<Link
									href={`/profile/${token.creator}`}
									className="font-mono text-zinc-500 hover:text-[#00ff87] transition-colors"
								>
									{shortenAddress(token.creator)}
								</Link>
								<CopyButton textToCopy={token.creator} />
							</div>
						)}

						{socialsWithLinks.length > 0 && (
							<div className="flex items-center gap-1.5">
								{socialsWithLinks.map((social) => (
									<Link
										key={social.key}
										href={social.href}
										target="_blank"
										rel="noopener noreferrer"
										className="flex h-6 w-6 items-center justify-center rounded-sm opacity-40 transition-all duration-200 hover:opacity-90 hover:bg-white/[0.04]"
									>
										<Image src={social.icon} unoptimized width={13} height={13} alt={social.key} />
									</Link>
								))}
							</div>
						)}

						{token?.contractAddress && (
							<Link
								href={getExplorerAddressUrl(token.contractAddress, token.chainId)}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1 font-mono text-zinc-700 hover:text-zinc-500 transition-colors"
							>
								<span>{shortenAddress(token.contractAddress)}</span>
								<ExternalLink className="size-2.5" />
							</Link>
						)}
					</div>

					{/* View mode toggle */}
					{headerAccessory && <div className="pt-1">{headerAccessory}</div>}
				</div>
			</div>
		</motion.div>
	);
}
