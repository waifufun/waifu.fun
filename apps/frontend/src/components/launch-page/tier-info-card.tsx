"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/contexts/locale-context";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";

import { VestingTimeline } from "./vesting-timeline";

type Props = {
	tier: LaunchTierInfo;
	vestingEnabled: boolean | null;
	/** Optional live vault metrics, used to drive the vesting progress bar. */
	launchTimestamp?: bigint | null;
	allocation?: bigint;
	claimed?: bigint;
	claimable?: bigint;
};

export function TierInfoCard({ tier, vestingEnabled, launchTimestamp, allocation, claimed, claimable }: Props) {
	const { t } = useTranslation();
	const vestingActive = vestingEnabled ?? tier.vestingEnabled;
	const graduates = tier.v2BuyBnb > 0;
	const pathCopy = graduates ? t("launch.tier.pathGraduates") : t("launch.tier.pathNoGraduate");

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="flex flex-col gap-1 border-b border-white/10 px-6 py-5">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
					{t("launch.tier.eyebrow")}
				</span>
				<CardTitle className="text-xl font-semibold text-zinc-100">{tier.label}</CardTitle>
				<p className="mt-1 text-xs text-zinc-400" data-testid="tier-path-copy">
					{pathCopy}
				</p>
			</CardHeader>
			<CardContent className="space-y-6 px-6 py-6">
				<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
					<Stat label={t("launch.tier.bundleLabel")} value={`${tier.bundlePct}%`} />
					<Stat label={t("launch.tier.presaleCapLabel")} value={`${tier.presaleCapBnb} bnb`} />
					{graduates ? (
						<Stat
							label={t("launch.tier.v2BuyAtOpenLabel")}
							value={t("launch.tier.v2BuyAtOpenValue", { amount: String(tier.v2BuyBnb) })}
							help={t("launch.tier.v2BuyHelpGraduates")}
						/>
					) : (
						<Stat
							label={t("launch.tier.v2BuyAtOpenLabel")}
							value={t("launch.tier.v2BuyAtOpenNa")}
							help={t("launch.tier.v2BuyHelpSmol")}
						/>
					)}
					<Stat label={t("launch.tier.circulatingSupplyLabel")} value={`${tier.circulatingSupplyM}m`} />
					<Stat label={t("launch.tier.circulatingMcLabel")} value={tier.openCircMcUsdHint} />
					<Stat label={t("launch.tier.fdvLabel")} value={tier.openFdvUsdHint} help={t("launch.tier.fdvHelp")} />
					<Stat label={t("launch.tier.presalerCostBasisLabel")} value={tier.presaler2xMultiple} fullWidth />
				</dl>
				{vestingActive ? (
					<div>
						<span className="mb-3 block text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
							{t("launch.tier.vestingHeading")}
						</span>
						<VestingTimeline
							vestingEnabled={vestingActive}
							launchTimestamp={launchTimestamp ?? null}
							allocation={allocation ?? 0n}
							claimed={claimed ?? 0n}
							claimable={claimable ?? 0n}
						/>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function Stat({ label, value, fullWidth, help }: { label: string; value: string; fullWidth?: boolean; help?: string }) {
	return (
		<div className={fullWidth ? "col-span-2" : undefined}>
			<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
				{help ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-help underline decoration-dotted underline-offset-4">{label}</span>
						</TooltipTrigger>
						<TooltipContent>{help}</TooltipContent>
					</Tooltip>
				) : (
					label
				)}
			</dt>
			<dd className="mt-1 text-zinc-100">{value}</dd>
		</div>
	);
}
