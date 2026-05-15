"use client";

/**
 * Side-by-side tier comparison. Mounted under the tier card grid as a
 * collapsible panel so users can diff burn/vesting/cap without flipping
 * between cards.
 */
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TIERS, type TierId, type TierPreset, formatUsdMarketCap, totalBnb } from "./tier-data";

type Props = {
	selectedId: TierId | null | undefined;
};

export function TierComparison({ selectedId }: Props) {
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
					compare all four tiers
				</span>
				<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-400">
					{open ? "hide" : "show"}
				</span>
			</button>
			{open ? (
				<div className="border-t border-white/10 px-4 py-3 overflow-x-auto">
					<table className="w-full text-[11px] tabular-nums">
						<thead>
							<tr className="text-left">
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">tier</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">cap</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">v2 buy</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									total bnb
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									presaler
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									circ mc
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="cursor-help underline decoration-dotted underline-offset-4">
												fdv <span className="normal-case tracking-normal">(includes burned supply)</span>
											</span>
										</TooltipTrigger>
										<TooltipContent>fully diluted valuation uses 1b tokens, including burned supply.</TooltipContent>
									</Tooltip>
								</th>
								<th className="pb-2 pr-3 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">burn</th>
								<th className="pb-2 font-mono uppercase tracking-[0.18em] text-neutral-500 font-normal">vesting</th>
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
	return (
		<tr className={cn("text-neutral-200 transition-colors", active ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]")}>
			<td className={cn("py-2 pr-3 font-mono", active ? "text-accent" : "text-neutral-300")}>
				tier_{tier.id}
				{active ? <span className="ml-1.5 text-[9px] uppercase tracking-[0.2em]">selected</span> : null}
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
