"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { type TierPreset, formatUsdMarketCap, totalBnb } from "./tier-data";

type Props = {
	tier: TierPreset | null;
};

function fmtBnb(n: number, digits = 0): string {
	return `${n.toFixed(digits)} BNB`;
}

/**
 * Live preview of the economics implied by the selected tier.
 * Mirrors the W30v3 burn edition math:
 *   - presale clears at `cap` BNB
 *   - platform contributes `v2Buy` BNB at v2 graduation
 *   - resulting open mc headline is post-burn circulating market cap
 *   - FDV is shown secondarily because it includes burned supply
 *   - a presaler clearing the cap unlocks a `presaler`x at open
 *   - `burn`% of total supply is burned at graduation
 *   - vesting controls the remaining unlock cadence
 */
export function EconomicsPreview({ tier }: Props) {
	const { t } = useTranslation();
	if (!tier) {
		return (
			<div
				className={cn(
					"border border-white/8 bg-white/[0.012] p-5",
					"text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-600",
				)}
			>
				{t("wizard.tier.emptyPreview")}
			</div>
		);
	}

	const presaleShare = tier.cap / totalBnb(tier);
	const platformShare = tier.v2Buy / totalBnb(tier);

	return (
		<div className="border border-accent/30 bg-accent/[0.02] p-5">
			<div className="flex items-baseline justify-between gap-3 mb-4">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-accent">{t("wizard.tier.economicsTitle", { id: String(tier.id) })}</p>
				<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{t("wizard.tier.livePreview")}</p>
			</div>

			{/* big numbers row */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
				<Metric label={t("wizard.tier.circulatingMc")} value={formatUsdMarketCap(tier.openCircMcBnb)} accent />
				<Metric
					label={t("wizard.tier.fdv")}
					value={formatUsdMarketCap(tier.openFdvBnb)}
					help={t("wizard.tier.headlineTooltip")}
				/>
				<Metric label={t("wizard.tier.presaler")} value={`${tier.presaler.toFixed(tier.presaler % 1 === 0 ? 0 : 1)}x`} />
				<Metric label={t("wizard.tier.totalBnb")} value={fmtBnb(totalBnb(tier))} />
			</div>

			{/* breakdown bar */}
			<div className="mb-1.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
				<span>{t("wizard.tier.presale", { amount: fmtBnb(tier.cap) })}</span>
				<span>{t("wizard.tier.v2Buy")} {fmtBnb(tier.v2Buy)}</span>
			</div>
			<div className="relative h-1.5 w-full bg-white/5 overflow-hidden mb-5">
				<div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${presaleShare * 100}%` }} />
				<div
					className="absolute inset-y-0 bg-accent/40"
					style={{ left: `${presaleShare * 100}%`, width: `${platformShare * 100}%` }}
				/>
			</div>

			<dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
				<Row label={t("wizard.tier.cap")} value={fmtBnb(tier.cap)} />
				<Row label={t("wizard.tier.v2Buy")} value={fmtBnb(tier.v2Buy)} />
				<Row label={t("wizard.tier.burn")} value={`${tier.burn}%`} />
				<Row label={t("wizard.tier.circulating")} value={`${tier.circulatingSupplyM}m`} />
				<Row label={t("wizard.tier.vesting")} value={tier.vesting} />
			</dl>

			<p className="mt-5 text-[11px] text-neutral-400 leading-relaxed">
				{t("wizard.tier.summary", { multiple: tier.presaler.toFixed(tier.presaler % 1 === 0 ? 0 : 1), vestingNote: tier.vesting === "none" ? t("wizard.tier.noVesting") : t("wizard.tier.withVesting"), burn: String(tier.burn), circulating: String(tier.circulatingSupplyM) })}
			</p>
		</div>
	);
}

function Metric({ label, value, accent, help }: { label: string; value: string; accent?: boolean; help?: string }) {
	const { t } = useTranslation();
	const labelNode = <span>{label}</span>;
	return (
		<div>
			<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">
				{help ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-help underline decoration-dotted underline-offset-4">
								{labelNode} <span className="normal-case tracking-normal">{t("wizard.tier.includesBurnedSupply")}</span>
							</span>
						</TooltipTrigger>
						<TooltipContent>{help}</TooltipContent>
					</Tooltip>
				) : (
					labelNode
				)}
			</p>
			<p className={cn("mt-1 text-xl tracking-tight tabular-nums lowercase", accent ? "text-accent" : "text-white")}>
				{value}
			</p>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="font-mono uppercase tracking-[0.2em] text-neutral-600">{label}</dt>
			<dd className="text-neutral-200 tabular-nums">{value}</dd>
		</div>
	);
}
