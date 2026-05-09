"use client";

import { useWizard } from "../wizard-state";
import { EconomicsPreview } from "./economics-preview";
import { TierCard } from "./tier-card";
import { TierComparison } from "./tier-comparison";
import { TIERS, type TierId, getTier } from "./tier-data";

/**
 * W48 step: pick a launch tier.
 *
 * Renders a 4-column grid of tier cards (TIER_80 / 90 / 95 / 98) with a
 * live economics preview panel below. Selection is persisted on the
 * wizard state under `launch.tierId`.
 */
export default function StepTier() {
	const { state, patchLaunch } = useWizard();
	const selectedId = state.launch.tierId;
	const selected = getTier(selectedId);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<div className="flex items-baseline justify-between mb-3">
					<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">launch tiers</p>
					<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">tier_90 recommended</p>
				</div>
				<p className="text-[12px] text-neutral-400 mb-4 leading-relaxed max-w-2xl">
					tiers price your launch. higher tier means more aggressive economics: smaller presale cap, larger platform v2
					buy, higher projected open mc. start with tier_90 if you're not sure.
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
					{TIERS.map((t) => (
						<TierCard
							key={t.id}
							tier={t}
							selected={selectedId === t.id}
							onSelect={() => patchLaunch({ tierId: t.id as TierId })}
						/>
					))}
				</div>
			</div>

			<TierComparison selectedId={selectedId} />

			<EconomicsPreview tier={selected} />
		</div>
	);
}
