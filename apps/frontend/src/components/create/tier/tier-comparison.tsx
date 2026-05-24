"use client";

/**
 * Side-by-side tier comparison. Mounted under the tier card grid as a
 * collapsible panel so users can diff burn/vesting/cap without flipping
 * between cards.
 */
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { TIERS, type TierId, type TierPreset, formatUsdMarketCap, tierDisplayName, totalBnb } from "./tier-data";

type Props = {
	selectedId: TierId | null | undefined;
};

export function TierComparison({ selectedId }: Props) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<div className="border border-white/10 bg-white/[0.012]">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
			>
				<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">
					{t("wizard.tier.compare")}
				</span>
				<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-400">
					{open ? t("wizard.common.hide") : t("wizard.common.show")}
				</span>
			</button>
			{open ? (
				<div className="border-t border-white/10 px-4 py-3 overflow-x-auto">
					<table className="w-full text-[11px] tabular-nums">
						<thead>
							<tr className="text-left">
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.tiers")}
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.cap")}
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.v2Buy")}
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.totalBnb")}
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.presaler")}
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.circulatingMc")}
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="cursor-help underline decoration-dotted underline-offset-4">
												{t("wizard.tier.fdv")}{" "}
												<span className="normal-case tracking-normal">{t("wizard.tier.includesBurnedSupply")}</span>
											</span>
										</TooltipTrigger>
										<TooltipContent>{t("wizard.tier.fdvTooltipGeneric")}</TooltipContent>
									</Tooltip>
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.burn")}
								</th>
								<th className="pb-2 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									{t("wizard.tier.vesting")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-white/5">
							{TIERS.map((t) => {
								const active = selectedId === t.id;
								return <Row key={t.id} tier={t} active={active} />;
							})}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}

function Row({ tier, active }: { tier: TierPreset; active: boolean }) {
	const { t } = useTranslation();
	return (
		<tr className={cn("text-neutral-200 transition-colors", active ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]")}>
			<td className={cn("py-2 pr-3 font-mono", active ? "text-accent" : "text-neutral-300")}>
				{tierDisplayName(tier.id)}
				{active ? (
					<span className="ml-1.5 text-[9px] uppercase tracking-[0.2em]">{t("wizard.tier.selected")}</span>
				) : null}
			</td>
			<td className="py-2 pr-3">{tier.cap} BNB</td>
			<td className="py-2 pr-3">{tier.v2Buy} BNB</td>
			<td className="py-2 pr-3">{totalBnb(tier)} BNB</td>
			<td className="py-2 pr-3">{tier.presaler.toFixed(tier.presaler % 1 === 0 ? 0 : 1)}x</td>
			<td className="py-2 pr-3">{formatUsdMarketCap(tier.openCircMcBnb)}</td>
			<td className="py-2 pr-3 text-neutral-400">{formatUsdMarketCap(tier.openFdvBnb)}</td>
			<td className="py-2 pr-3">{tier.burn}%</td>
			<td className="py-2 text-neutral-300">{tier.vesting}</td>
		</tr>
	);
}

export default TierComparison;
