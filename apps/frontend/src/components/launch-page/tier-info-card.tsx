"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
	const vestingActive = vestingEnabled ?? tier.vestingEnabled;
	const graduates = tier.v2BuyBnb > 0;
	const pathCopy = graduates
		? "presale → pcs v2 lp · 50/10/20 supply split · 30d vesting"
		: "presale → pcs curve · no v2 lp graduation";

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="flex flex-col gap-1 border-b border-white/10 px-6 py-5">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">tier</span>
				<CardTitle className="text-xl font-semibold text-zinc-100">{tier.label}</CardTitle>
				<p className="mt-1 text-xs text-zinc-400" data-testid="tier-path-copy">
					{pathCopy}
				</p>
			</CardHeader>
			<CardContent className="space-y-6 px-6 py-6">
				<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
					<Stat label="bundle" value={`${tier.bundlePct}%`} />
					<Stat label="presale cap" value={`${tier.presaleCapBnb} bnb`} />
					{graduates ? (
						<Stat
							label="v2 buy at open"
							value={`${tier.v2BuyBnb} bnb`}
							help="bnb the platform adds to pcs v2 lp at graduation. token supply split: 50% burn / 10% treasury lp / 20% presalers / 20% locked in pcs v2 lp."
						/>
					) : (
						<Stat
							label="v2 buy at open"
							value="n/a"
							help="SMOL does not graduate to v2; it trades on the pcs bonding curve until organic graduation."
						/>
					)}
					<Stat label="circulating supply" value={`${tier.circulatingSupplyM}m`} />
					<Stat label="circulating mc" value={tier.openCircMcUsdHint} />
					<Stat
						label="fdv"
						value={tier.openFdvUsdHint}
						help="fully diluted valuation includes burned supply. circulating mc removes tokens burned at launch."
					/>
					<Stat label="presaler cost basis" value={tier.presaler2xMultiple} fullWidth />
				</dl>
				{vestingActive ? (
					<div>
						<span className="mb-3 block text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">vesting</span>
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
