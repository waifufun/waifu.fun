/**
 * AgentCardV2. The wave-M+ agent card.
 *
 * What changed vs v1 (`agent-card.tsx`):
 *   - leads with the gallery-grade hero image, framed (not naked)
 *   - tier badge (SMOL / BASED / WAGMI / GIGACHAD) encoded in luminance,
 *     not hue, so the single accent (#00ff87) stays load-bearing
 *   - typographic hierarchy: name is large + tight, ticker is mono pill,
 *     stat labels are micro-caps, numbers are tabular mono
 *   - hairline-divided stat row instead of three boxed cards
 *   - token address with click-to-copy (stops nav from the button)
 *   - drops the v1 "warming up" / "last action" trivia. Nobody buys on it.
 *
 * Backend data not yet exposed (tracked in report under BACKEND-DATA-GAPS):
 *   - live MC in BNB / USD on the AgentSummary
 *   - 24h volume / holders count
 *   - per-launch treasury BNB balance
 * For each missing field we render a hairline dash; never a fake number.
 *
 * Style dials applied (per launch-day taste-skill brief):
 *   DESIGN_VARIANCE 6, MOTION_INTENSITY 4, VISUAL_DENSITY 4
 *   premium / calm / spacious. No purple, no glow, no shouting.
 */
"use client";

import { Check, Copy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";

import { SurfaceCard } from "@/components/ui/surface-card";
import { useLaunchByToken } from "@/hooks/use-post-launch";
import { resolveImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";

import {
	formatNumberShort,
	formatPercentShort,
	formatUsdShort,
	resolveTierId,
	shortAddress,
	tierDisplay,
} from "./agent-card-v2.helpers";
import type { AgentListItem } from "./types";

// Premium ease curve (apple-ish). Used on the hero image scale so the
// interaction feels weighty rather than springy.
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const CHAIN_BADGE: Record<number, { label: string; icon: string }> = {
	56: { label: "BSC", icon: "/chain-icons/bnb.svg" },
	8453: { label: "Base", icon: "/chain-icons/base.svg" },
	101: { label: "Solana", icon: "/chain-icons/solana.svg" },
};

const LAUNCHPAD_BADGE: Record<string, { label: string; icon: string }> = {
	flap: { label: "Flap", icon: "/venue-logos/flap.png" },
	bags: { label: "Bags", icon: "/venue-logos/bags.png" },
	bankr: { label: "Bankr", icon: "/venue-logos/bankr.svg" },
};

export interface AgentCardV2Props {
	agent: AgentListItem;
}

export default function AgentCardV2({ agent }: AgentCardV2Props) {
	const graduated = agent.status === "graduated";
	const pending = agent.status === "pending";

	// best-effort: pull the agent_launches row to surface tier + treasury
	// chrome. 404 / non-v3 launches return null and we render the
	// minimal card.
	const launch = useLaunchByToken(agent.tokenAddress);
	const tier = tierDisplay(resolveTierId(launch.data?.tier ?? null));

	return (
		<SurfaceCard variant="interactive" padding="none" asChild className="group overflow-hidden">
			<Link href={`/agent/${agent.tokenAddress}`}>
				{/* hero: framed, not naked. inset border + gradient floor gives
				    the image a physical edge so it reads as a poster, not a
				    placeholder. */}
				<div className="relative aspect-square w-full overflow-hidden border-b border-white/10 bg-[#0a0a0c]">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={resolveImageUrl(agent.image) ?? "/brand/icon/icon_on_black_512.png"}
						alt={`${agent.name} portrait`}
						loading="lazy"
						className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
						style={{ transitionTimingFunction: EASE }}
					/>
					{/* legibility floor for badges */}
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
					{/* inner hairline highlight, double-bezel-lite */}
					<div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04]" />
					{tier ? (
						<div className="absolute left-2.5 top-2.5">
							<span
								className={cn(
									"inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[9px] uppercase tracking-[0.22em] backdrop-blur-sm",
									tier.tone,
								)}
							>
								{tier.name}
							</span>
						</div>
					) : null}
					<div className="absolute right-2.5 top-2.5">
						<StatusBadge status={agent.status} />
					</div>
					<div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-1.5">
						<LaunchMetaBadges agent={agent} />
					</div>
				</div>

				{/* body */}
				<div className="flex flex-col gap-3.5 p-4 pt-3.5">
					{/* identity line: name leads, ticker as quiet pill */}
					<div className="flex items-baseline gap-2 min-w-0">
						<span className="truncate text-[15px] leading-tight tracking-tight text-white">{agent.name}</span>
						<span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-white/10 bg-white/[0.03] px-1.5 font-mono text-[10px] tracking-wider text-white/55">
							${agent.ticker}
						</span>
					</div>

					{/* hairline stat row. four micro-stats, divided by 1px
					    rather than wrapped in four little cards. */}
					<StatRow agent={agent} />

					{/* footer: state pill + token address (with copy) */}
					<div className="mt-0.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
						<StateDot graduated={graduated} pending={pending} />
						<TokenAddressRow address={agent.tokenAddress} />
					</div>
				</div>
			</Link>
		</SurfaceCard>
	);
}

function LaunchMetaBadges({ agent }: { agent: AgentListItem }) {
	const chain = CHAIN_BADGE[agent.chainId ?? 56] ?? null;
	const launchpad = LAUNCHPAD_BADGE[(agent.launchPlatform ?? "flap").toLowerCase()] ?? null;
	return (
		<>
			{launchpad ? <LogoBadge label={launchpad.label} icon={launchpad.icon} /> : null}
			{chain ? <LogoBadge label={chain.label} icon={chain.icon} /> : null}
		</>
	);
}

function LogoBadge({ label, icon }: { label: string; icon: string }) {
	return (
		<span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-white/15 bg-black/70 px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm">
			<span className="relative h-3.5 w-3.5 overflow-hidden rounded-[2px] bg-black">
				<Image src={icon} alt="" fill sizes="14px" className="object-contain" />
			</span>
			{label}
		</span>
	);
}

function StatRow({ agent }: { agent: AgentListItem }) {
	const mc = agent.marketCap;
	const change24h = agent.priceChange24h;
	const holders = agent.holders;
	const treasury = agent.treasuryUsd;

	return (
		<div className="grid grid-cols-4 divide-x divide-white/[0.06]">
			<StatCell label="mc" value={mc !== undefined ? formatUsdShort(mc) : "·"} align="start" />
			<StatCell label="24h" value={change24h !== undefined ? formatPercentShort(change24h) : "·"} />
			<StatCell label="holders" value={holders !== undefined ? formatNumberShort(holders) : "·"} />
			<StatCell label="treasury" value={treasury !== undefined ? formatUsdShort(treasury) : "·"} />
		</div>
	);
}

function StatCell({
	label,
	value,
	suffix,
	align = "start",
}: {
	label: string;
	value: string;
	suffix?: string;
	align?: "start" | "end";
}) {
	return (
		<div className={cn("flex flex-col gap-0.5 px-2.5 py-0.5 first:pl-0 last:pr-0", align === "end" && "items-end")}>
			<span className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-white/30">{label}</span>
			<div className="flex items-baseline gap-1">
				<span className="font-mono text-[12px] tabular-nums tracking-tight text-white/90">{value}</span>
				{suffix ? (
					<span className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-white/30">{suffix}</span>
				) : null}
			</div>
		</div>
	);
}

function StateDot({ graduated, pending }: { graduated: boolean; pending: boolean }) {
	const label = pending ? "pending" : graduated ? "live on dex" : "on curve";
	const dot = pending ? "bg-white/25" : graduated ? "bg-white/45" : "bg-[#00ff87] animate-pulse";
	return (
		<span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
			<span className={cn("h-1 w-1 rounded-full", dot)} />
			{label}
		</span>
	);
}

function TokenAddressRow({ address }: { address: string }) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			// inside an `<a>` wrapper; never let the click bubble into nav.
			e.preventDefault();
			e.stopPropagation();
			void (async () => {
				try {
					await navigator.clipboard.writeText(address);
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				} catch (err) {
					console.error("clipboard copy failed", err);
				}
			})();
		},
		[address],
	);

	return (
		<div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
			<span className="tabular-nums" title={address}>
				{shortAddress(address)}
			</span>
			<button
				type="button"
				onClick={copy}
				aria-label={copied ? "copied" : "copy token address"}
				className={cn(
					"inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors duration-200",
					copied
						? "border-[#00ff87]/60 text-[#00ff87]"
						: "border-white/10 text-white/30 hover:border-white/25 hover:text-white/75",
				)}
			>
				{copied ? <Check className="h-3 w-3" strokeWidth={2} /> : <Copy className="h-3 w-3" strokeWidth={1.5} />}
			</button>
		</div>
	);
}

function StatusBadge({ status }: { status: AgentListItem["status"] }) {
	if (status === "graduated") {
		return (
			<span className="inline-flex h-5 items-center gap-1.5 rounded-sm border border-white/20 bg-black/70 px-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/70 backdrop-blur-sm">
				<span className="h-1 w-1 rounded-full bg-white/50" />
				graduated
			</span>
		);
	}
	if (status === "pending") {
		return (
			<span className="inline-flex h-5 items-center gap-1.5 rounded-sm border border-white/15 bg-black/70 px-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40 backdrop-blur-sm">
				<span className="h-1 w-1 rounded-full bg-white/30" />
				pending
			</span>
		);
	}
	return (
		<span className="inline-flex h-5 items-center gap-1.5 rounded-sm border border-[#00ff87]/40 bg-black/70 px-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#00ff87] backdrop-blur-sm">
			<span className="h-1 w-1 animate-pulse rounded-full bg-[#00ff87]" />
			active
		</span>
	);
}
