"use client";

import FourMemeRegularConfig from "./launchpad/fee-config/four-meme-regular-config";
import FourMemeTaxConfig from "./launchpad/fee-config/four-meme-tax-config";
import FlapConfig from "./launchpad/fee-config/flap-config";
import LaunchpadPicker from "./launchpad/launchpad-picker";
import { useWizard } from "./wizard-state";
import { DEFAULT_FLAP, DEFAULT_FOUR_MEME_REGULAR, DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import type { FlapFeeConfig, FourMemeTaxFeeConfig, LaunchpadId } from "@/lib/launchpad/types";

export default function StepLaunchpad() {
	const { state, patchLaunchpad } = useWizard();
	const selectedId = state.launchpad.selectedId;
	const feeConfig = state.launchpad.feeConfig;

	const handleSelect = (id: LaunchpadId) => {
		// switch fee config to the picked launchpad's default if the kind shifts.
		const next =
			id === "four-meme-tax"
				? DEFAULT_FOUR_MEME_TAX
				: id === "four-meme-regular"
					? DEFAULT_FOUR_MEME_REGULAR
					: id === "flap"
						? DEFAULT_FLAP
						: null;

		patchLaunchpad({ selectedId: id, feeConfig: next });
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
