"use client";

import { deriveAgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { hasAggregateHolderCount, isHolderDataIndexed } from "@/components/token-page/holder-data-state";
import { useTranslation } from "@/contexts/locale-context";
import { abbreviateNumber, formatNumberSubscript } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { Activity, BarChart3, Database, Users } from "lucide-react";

function SnapshotItem({
	label,
	value,
	icon: Icon,
	helper,
}: {
	label: string;
	value: string;
	icon: typeof Activity;
	helper?: string;
}) {
	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] px-3 py-2.5">
			<div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#71717a]">
				<Icon className="size-3 text-[#52525b]" />
				<span>{label}</span>
			</div>
			<p className="mt-1 text-sm font-mono text-[#e4e4e7]">{value}</p>
			{helper && <p className="mt-1 text-[11px] leading-relaxed text-[#71717a]">{helper}</p>}
		</div>
	);
}

export default function MarketSnapshotCard({
	token,
	marketDataSource,
}: {
	token: IToken;
	marketDataSource?: "dexscreener" | null;
}) {
	const { t } = useTranslation();
	const status = deriveAgentLifecycleStatus(token);
	const holdersIndexed = isHolderDataIndexed(token);
	const hasAggregateHolders = hasAggregateHolderCount(token);
	const marketFeed = status.isExternalMarket
		? marketDataSource === "dexscreener"
			? t("token.snapshot.feedLiveExternal")
			: t("token.snapshot.feedIndexedFallback")
		: t("token.snapshot.feedWaifu");
	const volumeHelper =
		status.isExternalMarket && marketDataSource !== "dexscreener" ? t("token.snapshot.volumeHelperNoFeed") : null;
	const holdersHelper = holdersIndexed
		? null
		: hasAggregateHolders
			? t("token.snapshot.holdersHelperAggregate")
			: t("token.snapshot.holdersHelperMissing");

	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#71717a]">
						{t("token.snapshot.eyebrow")}
					</p>
					<h3 className="mt-1 text-sm font-semibold lowercase tracking-wide text-[#f4f4f5]">
						{t("token.snapshot.title")}
					</h3>
				</div>
				<span className="rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#a1a1aa]">
					{marketFeed}
				</span>
			</div>

			<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
				<SnapshotItem label={t("token.snapshot.price")} value={formatNumberSubscript(token.price)} icon={Activity} />
				<SnapshotItem
					label={t("token.snapshot.marketCap")}
					value={token.marketcap ? `$${abbreviateNumber(token.marketcap)}` : "–"}
					icon={BarChart3}
				/>
				<SnapshotItem
					label={t("token.snapshot.volume24h")}
					value={token.volume24h ? `$${abbreviateNumber(token.volume24h)}` : "–"}
					icon={Database}
					{...(volumeHelper ? { helper: volumeHelper } : {})}
				/>
				<SnapshotItem
					label={t("token.snapshot.holders")}
					value={hasAggregateHolders ? abbreviateNumber(token.holders, true) : t("token.snapshot.holdersUnavailable")}
					icon={Users}
					{...(holdersHelper ? { helper: holdersHelper } : {})}
				/>
			</div>
		</div>
	);
}
