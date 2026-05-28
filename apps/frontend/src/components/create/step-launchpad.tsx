"use client";

import {
	DEFAULT_BAGS,
	DEFAULT_BANKR,
	DEFAULT_FLAP,
	DEFAULT_FOUR_MEME_REGULAR,
	DEFAULT_FOUR_MEME_TAX,
} from "@/lib/launchpad/fee-defaults";
import type { FlapFeeConfig, FourMemeTaxFeeConfig, LaunchpadDescriptor } from "@/lib/launchpad/types";
import { useEffect } from "react";
import FlapConfig from "./launchpad/fee-config/flap-config";
import FourMemeRegularConfig from "./launchpad/fee-config/four-meme-regular-config";
import FourMemeTaxConfig from "./launchpad/fee-config/four-meme-tax-config";
import LaunchpadPicker from "./launchpad/launchpad-picker";
import { useWizard } from "./wizard-state";

export default function StepLaunchpad() {
	const { state, patchLaunchpad } = useWizard();
	const selectedId = state.launchpad.selectedId;
	const feeConfig = state.launchpad.feeConfig;

	// Default to the current BSC path while keeping Base/Solana one click away.
	// biome-ignore lint/correctness/useExhaustiveDependencies: one-shot default-bootstrapping effect; intentionally only runs on mount when both fields are still null.
	useEffect(() => {
		if (selectedId === null && feeConfig === null) {
			patchLaunchpad({
				selectedId: "flap",
				selectedChain: "bsc",
				feeConfig: DEFAULT_FLAP,
			});
		}
	}, []);

	const handleSelect = (descriptor: LaunchpadDescriptor) => {
		// switch fee config to the picked launchpad's default if the kind shifts.
		const next =
			descriptor.id === "four-meme-tax"
				? DEFAULT_FOUR_MEME_TAX
				: descriptor.id === "four-meme-regular"
					? DEFAULT_FOUR_MEME_REGULAR
					: descriptor.id === "flap"
						? DEFAULT_FLAP
						: descriptor.id === "bags"
							? DEFAULT_BAGS
							: descriptor.id === "bankr"
								? DEFAULT_BANKR
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

			{feeConfig?.kind === "bags" || feeConfig?.kind === "bankr" ? (
				<div className="border-t border-white/5 pt-8">
					<div className="border border-white/10 bg-white/[0.012] p-5">
						<p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">fee routing</p>
						{feeConfig.kind === "bankr" ? (
							<p className="mt-2 text-sm text-neutral-200">
								57% creator
								<span className="text-neutral-600 mx-2">/</span>
								{feeConfig.platformCutBps / 100}% partner share
							</p>
						) : (
							<p className="mt-2 text-sm text-neutral-200">
								{feeConfig.creatorFeeBps / 100}% creator
								<span className="text-neutral-600 mx-2">/</span>
								{feeConfig.platformCutBps / 100}% platform
							</p>
						)}
					</div>
				</div>
			) : null}

			{feeConfig === null && selectedId === null ? (
				<p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-600">
					select flap above to configure fees.
				</p>
			) : null}
		</div>
	);
}
