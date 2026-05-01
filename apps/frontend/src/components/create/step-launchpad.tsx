"use client";

import { DEFAULT_FLAP, DEFAULT_FOUR_MEME_REGULAR, DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import type { FlapFeeConfig, FourMemeTaxFeeConfig, LaunchpadDescriptor } from "@/lib/launchpad/types";
import FlapConfig from "./launchpad/fee-config/flap-config";
import FourMemeRegularConfig from "./launchpad/fee-config/four-meme-regular-config";
import FourMemeTaxConfig from "./launchpad/fee-config/four-meme-tax-config";
import LaunchpadPicker from "./launchpad/launchpad-picker";
import { useWizard } from "./wizard-state";

export default function StepLaunchpad() {
	const { state, patchLaunchpad } = useWizard();
	const selectedId = state.launchpad.selectedId;
	const feeConfig = state.launchpad.feeConfig;

	const handleSelect = (descriptor: LaunchpadDescriptor) => {
		// switch fee config to the picked launchpad's default if the kind shifts.
		const next =
			descriptor.id === "four-meme-tax"
				? DEFAULT_FOUR_MEME_TAX
				: descriptor.id === "four-meme-regular"
					? DEFAULT_FOUR_MEME_REGULAR
					: descriptor.id === "flap"
						? DEFAULT_FLAP
						: null;

		patchLaunchpad({ selectedId: descriptor.id, selectedChain: descriptor.chain, feeConfig: next });
	};

	return (
		<div className="flex flex-col gap-10">
			<LaunchpadPicker selectedId={selectedId} onSelect={handleSelect} />

			{feeConfig?.kind === "four-meme-tax" ? (
				<div className="border-t border-white/5 pt-8">
					<FourMemeTaxConfig
						value={feeConfig}
						onChange={(next: FourMemeTaxFeeConfig) => patchLaunchpad({ feeConfig: next })}
					/>
				</div>
			) : null}

			{feeConfig?.kind === "four-meme-regular" ? (
				<div className="border-t border-white/5 pt-8">
					<FourMemeRegularConfig />
				</div>
			) : null}

			{feeConfig?.kind === "flap" ? (
				<div className="border-t border-white/5 pt-8">
					<FlapConfig value={feeConfig} onChange={(next: FlapFeeConfig) => patchLaunchpad({ feeConfig: next })} />
				</div>
			) : null}

			{feeConfig === null && selectedId === null ? (
				<p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-600">
					pick a launchpad above to configure fees.
				</p>
			) : null}
		</div>
	);
}
