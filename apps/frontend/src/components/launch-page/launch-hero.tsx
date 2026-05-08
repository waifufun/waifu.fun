"use client";

import { Users } from "lucide-react";
import { formatEther } from "viem";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";
import type { PublicLaunchExtended } from "@/lib/launch-vault/api";

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
	0: "open",
	1: "closed",
	2: "launched",
};

export function LaunchHero({ meta, tier, totalDeposited, depositorCount, closeTimestamp, state }: Props) {
	const name = meta?.tokenName ?? "agent launch";
	const symbol = meta?.tokenTicker ?? "—";
	const image = meta?.tokenImageUrl ?? null;
	const stateLabel = state !== null ? (STATE_LABEL[state] ?? "unknown") : "loading";

	const capWei = meta?.presaleCapWei ? BigInt(meta.presaleCapWei) : capFromBnb(tier.presaleCapBnb);
	const pct = capWei === 0n ? 0 : Number((totalDeposited * 10_000n) / capWei) / 100;
	const pctClamped = Math.min(100, Math.max(0, pct));

	return (
		<section className="border border-white/10 bg-[#08080a] p-6 md:p-8">
			<div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
				<div className="flex items-start gap-4">
					{image ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={image} alt={`${name} logo`} className="size-16 border border-white/10 object-cover md:size-20" />
					) : (
						<div className="flex size-16 items-center justify-center border border-white/10 bg-[#111114] text-xs font-mono uppercase tracking-[0.2em] text-zinc-500 md:size-20">
							no logo
						</div>
					)}
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-2xl font-semibold text-zinc-100 md:text-3xl">{name}</h1>
							<span className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-500">${symbol}</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="default">{tier.label}</Badge>
							<Badge variant="outline" className="text-zinc-300">
								state: {stateLabel}
							</Badge>
							<span className="flex items-center gap-1 text-xs text-zinc-400">
								<Users className="size-3" /> {depositorCount.toString()} backers
							</span>
						</div>
					</div>
				</div>

				<div className="flex flex-col items-start md:items-end">
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">round closes in</span>
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
