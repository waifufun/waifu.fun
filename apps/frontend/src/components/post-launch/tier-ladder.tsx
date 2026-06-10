"use client";

import type { Address } from "viem";

import { useTranslation } from "@/contexts/locale-context";
import { useTreasuryLpTiers } from "@/hooks/use-post-launch";

import { formatUsdFromChainlink } from "./__lib/format";

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
	const { t } = useTranslation();
	const meta = useTreasuryLpTiers(treasuryLp);

	if (!treasuryLp) {
		return <Card>{t("post.tier.notDeployed")}</Card>;
	}

	if (meta.isLoading || !meta.data) {
		return (
			<Card>
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
					{t("post.tier.statusLabel")}
				</div>
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
		return <Card>{t("post.tier.noData")}</Card>;
	}

	const nextTier = tiers.find((t) => !t.deployed && t.idx >= nextTierIndex);
	const remainingUsd = nextTier && nextTier.targetMcUsd > currentMcUsd ? nextTier.targetMcUsd - currentMcUsd : 0n;

	return (
		<section className="border border-white/10 bg-[#08080a] rounded-sm p-5" aria-label={t("post.tier.sectionAria")}>
			<div className="flex items-center justify-between mb-4">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
					{t("post.tier.statusLabel")}
				</div>
				<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 tabular-nums">
					{t("post.tier.mcPrefix")} {formatUsdFromChainlink(currentMcUsd)}
				</div>
			</div>
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label={t("post.tier.cellsAria")}>
				{tiers.map((tier) => (
					<TierCell key={tier.idx} tier={tier} />
				))}
			</div>
			{nextTier ? (
				<div className="mt-4 text-[11px] font-mono text-white/55" aria-live="polite">
					{t("post.tier.next")} <span className="text-white/85">t{nextTier.idx + 1}</span> {t("post.tier.at")}{" "}
					<span className="text-white/85">
						{formatUsdFromChainlink(nextTier.targetMcUsd)} {t("post.tier.mcSuffix")}
					</span>
					{remainingUsd > 0n ? (
						<>
							{" "}
							<span className="text-white/40">·</span>{" "}
							<span className="text-[#00ff87]">
								{formatUsdFromChainlink(remainingUsd)} {t("post.tier.away")}
							</span>
						</>
					) : (
						<>
							{" "}
							<span className="text-[#00ff87]">{t("post.tier.thresholdReached")}</span>
						</>
					)}
				</div>
			) : (
				<div className="mt-4 text-[11px] font-mono text-[#00ff87]">{t("post.tier.allDeployed")}</div>
			)}
		</section>
	);
}

function TierCell({ tier }: { tier: TierRow }) {
	const { t } = useTranslation();
	const statusKey = tier.paused ? "paused" : tier.deployed ? "deployed" : "pending";
	const status =
		statusKey === "paused"
			? t("post.tier.cellStatus.paused")
			: statusKey === "deployed"
				? t("post.tier.cellStatus.deployed")
				: t("post.tier.cellStatus.pending");
	const colorClass =
		statusKey === "deployed"
			? "border-[#00ff87]/40 bg-[#00ff87]/[0.07] text-[#00ff87]"
			: statusKey === "paused"
				? "border-amber-400/30 bg-amber-400/[0.05] text-amber-300"
				: "border-white/10 bg-white/[0.02] text-white/55";

	const epochs = !tier.deployed && tier.minEpochs > 0 ? `${tier.epochsAbove}/${tier.minEpochs}` : null;
	const tierLabel = t("post.tier.cellAria", {
		idx: String(tier.idx + 1),
		target: formatUsdFromChainlink(tier.targetMcUsd),
		status,
		epochs: epochs ? t("post.tier.cellAriaEpochsSuffix", { epochs }) : "",
	});

	return (
		<div className={`border ${colorClass} rounded-sm px-3 py-3 flex flex-col gap-1`} aria-label={tierLabel}>
			<div className="text-[10px] font-mono uppercase tracking-[0.18em] opacity-80">t{tier.idx + 1}</div>
			<div className="text-sm tabular-nums">{formatUsdFromChainlink(tier.targetMcUsd)}</div>
			<div className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
				{status}
				{epochs ? ` · ${epochs}` : ""}
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
