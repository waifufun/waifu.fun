"use client";

import { useWizard } from "../wizard-state";
import { EconomicsPreview } from "./economics-preview";
import { TierCard } from "./tier-card";
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
		<div className="flex flex-col gap-8">
			<div>
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500 mb-3">launch tiers</p>
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

			<EconomicsPreview tier={selected} />
		</div>
	);
}
