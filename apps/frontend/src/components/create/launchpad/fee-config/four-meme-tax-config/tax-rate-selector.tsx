"use client";

import { type FourMemeTaxFeeConfig, TAX_TIER_BPS } from "@/lib/launchpad/types";
import { cn } from "@/lib/utils";

type Props = {
	taxBps: FourMemeTaxFeeConfig["taxBps"];
	onChange: (next: FourMemeTaxFeeConfig["taxBps"]) => void;
};

export function TaxRateSelector({ taxBps, onChange }: Props) {
	return (
		<section>
			<header className="mb-3">
				<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">trade tax</h2>
				<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
					applied to every buy and sell. tax flows on-chain through a CREATE2 splitter.
				</p>
			</header>
			<div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="trade tax tier">
				{TAX_TIER_BPS.map((tier) => {
					const active = taxBps === tier;
					return (
						<button
							key={tier}
							type="button"
							// biome-ignore lint/a11y/useSemanticElements: styled radio button group; native radios cannot be styled to match the design
							role="radio"
							aria-checked={active}
							onClick={() => onChange(tier)}
							className={cn(
								"h-12 px-3 border text-sm font-mono tabular-nums tracking-tight",
								"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
								active
									? "border-accent text-accent bg-accent/[0.04]"
									: "border-white/10 text-neutral-300 hover:border-white/30 hover:text-white",
							)}
						>
							{tier / 100}%
						</button>
					);
				})}
			</div>
		</section>
	);
}
