"use client";

import { Users } from "lucide-react";
import { formatEther } from "viem";

import { Badge } from "@/components/ui/badge";
import type { PublicLaunchExtended } from "@/lib/launch-vault/api";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";
import { cn } from "@/lib/utils";

import { LaunchCountdown } from "./launch-countdown";

type Props = {
	meta: PublicLaunchExtended | null;
	tier: LaunchTierInfo;
	totalDeposited: bigint;
	depositorCount: bigint;
	closeTimestamp: bigint | null;
	state: number | null;
};

const STATE_LABEL: Record<number, string> = {
	0: "live",
	1: "closed",
	2: "launched",
};

const STATE_DOT: Record<number, string> = {
	0: "bg-[#00ff87] animate-pulse",
	1: "bg-yellow-300",
	2: "bg-blue-300",
};

const STATE_BADGE_CLASS: Record<number, string> = {
	0: "border-[#00ff87]/40 text-[#00ff87] bg-[#00ff87]/[0.05]",
	1: "border-yellow-400/40 text-yellow-300 bg-yellow-400/5",
	2: "border-blue-400/40 text-blue-300 bg-blue-400/5",
};

export function LaunchHero({ meta, tier, totalDeposited, depositorCount, closeTimestamp, state }: Props) {
	const name = meta?.tokenName ?? "agent launch";
	const symbol = meta?.tokenTicker ?? "–";
	const image = meta?.tokenImageUrl ?? null;
	const stateLabel = state !== null ? (STATE_LABEL[state] ?? "unknown") : "loading";
	const dotClass = state !== null ? (STATE_DOT[state] ?? "bg-white/40") : "bg-white/40";
	const stateBadgeClass =
		state !== null
			? (STATE_BADGE_CLASS[state] ?? "border-white/15 text-white/60 bg-white/5")
			: "border-white/15 text-white/60 bg-white/5";

	const capWei = meta?.presaleCapWei ? BigInt(meta.presaleCapWei) : capFromBnb(tier.presaleCapBnb);
	const pct = capWei === 0n ? 0 : Number((totalDeposited * 10_000n) / capWei) / 100;
	const pctClamped = Math.min(100, Math.max(0, pct));

	return (
		<section className="border border-white/10 bg-[#08080a] p-5 md:p-8">
			<div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
				<div className="flex items-start gap-3 md:gap-4 min-w-0">
					{image ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={image}
							alt={`${name} logo`}
							className="size-14 shrink-0 rounded-sm border border-white/10 object-cover md:size-20"
						/>
					) : (
						<div className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-[#111114] text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 md:size-20">
							no logo
						</div>
					)}
					<div className="flex flex-col gap-2 min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-xl font-semibold text-zinc-100 md:text-3xl truncate">{name}</h1>
							<span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 md:text-sm">${symbol}</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-[0.2em]",
									stateBadgeClass,
								)}
							>
								<span className={cn("w-1 h-1 rounded-full", dotClass)} />
								{stateLabel}
							</span>
							<Badge variant="default">{tier.label}</Badge>
							<span className="flex items-center gap-1 text-xs text-zinc-400">
								<Users className="size-3" /> {depositorCount.toString()} backer{depositorCount === 1n ? "" : "s"}
							</span>
						</div>
					</div>
				</div>

				<div className="flex flex-col items-start md:items-end shrink-0">
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
						{state === 0 ? "closes in" : state === 1 ? "awaiting bundle" : state === 2 ? "live on dex" : "status"}
					</span>
					<LaunchCountdown closeTimestampSec={closeTimestamp} className="mt-1 flex items-baseline gap-2" />
				</div>
			</div>

			<div className="mt-8 flex flex-col gap-2">
				<div className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
					<span>
						{formatBnb(totalDeposited)} / {formatBnb(capWei)} bnb
					</span>
					<span className="tabular-nums">{pctClamped.toFixed(1)}%</span>
				</div>
				<div className="h-2 w-full overflow-hidden border border-white/10 bg-[#111114]">
					<div
						className={cn("h-full bg-[#00ff87] transition-[width] duration-500")}
						style={{ width: `${pctClamped}%` }}
					/>
				</div>
			</div>
		</section>
	);
}

function capFromBnb(bnb: number): bigint {
	return BigInt(Math.floor(bnb * 1e6)) * 10n ** 12n;
}

function formatBnb(value: bigint): string {
	const ether = formatEther(value);
	const num = Number(ether);
	if (!Number.isFinite(num)) return ether;
	if (num === 0) return "0";
	if (num >= 100) return num.toFixed(1);
	if (num >= 1) return num.toFixed(2);
	return num.toFixed(4);
}
