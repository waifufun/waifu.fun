"use client";

import type { Address } from "viem";

import { useTreasuryLpTiers } from "@/hooks/use-post-launch";

type Props = {
	treasuryLp: Address | undefined;
};

type TierRow = {
	idx: number;
	targetMcUsd: bigint; // chainlink-scaled (1e8 implied per oracle math)
	deployed: boolean;
	paused: boolean;
	epochsAbove: number;
	minEpochs: number;
};

/**
 * Visual T1\u2013T4 deploy status. Reads `tiers[i]`, `currentMcUSD`, and
 * `nextTierIndex` from the TreasuryLP contract. The next undeployed tier
 * shows the "$X away" countdown using the `currentMcUSD` view.
 *
 * The TreasuryLP `targetMcUSD` value is denominated in BNB-token oracle
 * units; we treat it as USD with 8 decimals (chainlink convention) and
 * compress to "$1.5M" style strings. If the chain math evolves, only the
 * format helper changes.
 */
export function TierLadder({ treasuryLp }: Props) {
	const meta = useTreasuryLpTiers(treasuryLp);

	if (!treasuryLp) {
		return <Card>not yet deployed</Card>;
	}

	if (meta.isLoading || !meta.data) {
		return (
			<Card>
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">tier deploy status</div>
				<div className="mt-3 h-20 animate-pulse rounded-sm border border-white/5 bg-white/[0.02]" />
			</Card>
		);
	}

	const rows = meta.data;
	const currentMcUsd = (rows[0]?.result as bigint | undefined) ?? 0n;
	const nextTierIndex = Number((rows[1]?.result as number | undefined) ?? 0);

	const tiers: TierRow[] = [];
	for (let i = 0; i < 4; i++) {
		const tierResult = rows[2 + i]?.result as
			| readonly [bigint, bigint, number, number, number, number, number, boolean, boolean, bigint]
			| undefined;
		if (!tierResult) continue;
		tiers.push({
			idx: i,
			targetMcUsd: tierResult[0],
			minEpochs: tierResult[4],
			epochsAbove: tierResult[5],
			deployed: tierResult[7],
			paused: tierResult[8],
		});
	}

	if (tiers.length === 0) {
		return <Card>no tier data</Card>;
	}

	const nextTier = tiers.find((t) => !t.deployed && t.idx >= nextTierIndex);
	const remainingUsd = nextTier && nextTier.targetMcUsd > currentMcUsd ? nextTier.targetMcUsd - currentMcUsd : 0n;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5">
			<div className="flex items-center justify-between mb-4">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">tier deploy status</div>
				<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 tabular-nums">
					mc {formatUsd(currentMcUsd)}
				</div>
			</div>
			<div className="grid grid-cols-4 gap-2">
				{tiers.map((t) => (
					<TierCell key={t.idx} tier={t} />
				))}
			</div>
			{nextTier ? (
				<div className="mt-4 text-[11px] font-mono text-white/55">
					next: <span className="text-white/85">t{nextTier.idx + 1}</span> at{" "}
					<span className="text-white/85">{formatUsd(nextTier.targetMcUsd)} mc</span>
					{remainingUsd > 0n ? (
						<>
							{" "}
							<span className="text-white/40">\u2013</span>{" "}
							<span className="text-[#00ff87]">{formatUsd(remainingUsd)} away</span>
						</>
					) : (
						<>
							{" "}
							<span className="text-[#00ff87]">threshold reached</span>
						</>
					)}
				</div>
			) : (
				<div className="mt-4 text-[11px] font-mono text-[#00ff87]">all four tiers deployed</div>
			)}
		</div>
	);
}

function TierCell({ tier }: { tier: TierRow }) {
	const status = tier.paused ? "paused" : tier.deployed ? "deployed" : "pending";
	const colorClass =
		status === "deployed"
			? "border-[#00ff87]/40 bg-[#00ff87]/[0.07] text-[#00ff87]"
			: status === "paused"
				? "border-amber-400/30 bg-amber-400/[0.05] text-amber-300"
				: "border-white/10 bg-white/[0.02] text-white/55";

	const epochs = !tier.deployed && tier.minEpochs > 0 ? `${tier.epochsAbove}/${tier.minEpochs}` : null;

	return (
		<div className={`border ${colorClass} rounded-sm px-3 py-3 flex flex-col gap-1`}>
			<div className="text-[10px] font-mono uppercase tracking-[0.18em] opacity-80">t{tier.idx + 1}</div>
			<div className="text-sm tabular-nums">{formatUsd(tier.targetMcUsd)}</div>
			<div className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
				{status}
				{epochs ? ` \u00b7 ${epochs}` : ""}
			</div>
		</div>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5 text-[11px] font-mono text-white/40">
			{children}
		</div>
	);
}

/**
 * `value` is a chainlink-scale 1e8 USD bigint. We compress to compact
 * notation: < $1k -> "$X", < $1M -> "$Xk", else "$X.YM" / "$X.YB".
 */
function formatUsd(value: bigint): string {
	const usd = Number(value) / 1e8;
	if (!Number.isFinite(usd) || usd <= 0) return "$0";
	if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}b`;
	if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}m`;
	if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}k`;
	return `$${usd.toFixed(0)}`;
}
