"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";

import { VestingTimeline } from "./vesting-timeline";

type Props = {
	tier: LaunchTierInfo;
	vestingEnabled: boolean | null;
};

export function TierInfoCard({ tier, vestingEnabled }: Props) {
	const vestingActive = vestingEnabled ?? tier.vestingEnabled;

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="flex flex-col gap-1 border-b border-white/10 px-6 py-5">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">tier breakdown</span>
				<CardTitle className="text-xl font-semibold text-zinc-100">{tier.label}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6 px-6 py-6">
				<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
					<Stat label="bundle" value={`${tier.bundlePct}%`} />
					<Stat label="presale cap" value={`${tier.presaleCapBnb} bnb`} />
					<Stat label="v2 buy at open" value={`${tier.v2BuyBnb} bnb`} />
					<Stat label="circulating supply" value={`${tier.circulatingSupplyM}m`} />
					<Stat label="circulating mc" value={tier.openCircMcUsdHint} />
					<Stat
						label="fdv"
						value={tier.openFdvUsdHint}
						help="fully diluted valuation includes burned supply. circulating mc removes tokens burned at launch."
					/>
					<Stat label="presaler cost basis" value={tier.presaler2xMultiple} fullWidth />
				</dl>
				<div>
					<span className="mb-3 block text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">vesting</span>
					<VestingTimeline vestingEnabled={vestingActive} />
				</div>
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
							<span className="cursor-help underline decoration-dotted underline-offset-4">
								{label} <span className="normal-case tracking-normal">(includes burned supply)</span>
							</span>
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
