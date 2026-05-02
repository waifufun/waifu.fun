"use client";

import type { FourMemeTaxFeeConfig } from "@/lib/launchpad/types";
import { computePlatformCutVolumeBps, sumAllocationBps, validateFourMemeTax } from "@/lib/launchpad/validators";
import { useCallback, useMemo } from "react";
import { AllocationGrid } from "./allocation-grid";
import { MinHolderField } from "./min-holder-field";
import { PlatformCutBreakdown } from "./platform-cut-breakdown";
import { PlatformCutSection } from "./platform-cut-section";
import { rescaleAllocation } from "./rescale";
import { TaxRateSelector } from "./tax-rate-selector";
import { ValidationBanners } from "./validation-banners";

type Props = {
	value: FourMemeTaxFeeConfig;
	onChange: (next: FourMemeTaxFeeConfig) => void;
};

export default function FourMemeTaxConfig({ value, onChange }: Props) {
	const validation = useMemo(() => validateFourMemeTax(value), [value]);
	const allocationSum = sumAllocationBps(value.allocation);
	const expectedSum = 10_000 - value.platformCutBps;
	const sumOff = allocationSum !== expectedSum;
	const platformCutVolumeBps = computePlatformCutVolumeBps(value.taxBps, value.platformCutBps);

	const setTax = useCallback(
		(taxBps: FourMemeTaxFeeConfig["taxBps"]) => {
			onChange({ ...value, taxBps });
		},
		[onChange, value],
	);

	const setPlatformCut = useCallback(
		(platformCutBps: number) => {
			const safe = Math.max(0, Math.min(10_000, Math.round(platformCutBps)));
			const target = 10_000 - safe;
			const rescaled = rescaleAllocation(value.allocation, target);
			onChange({
				...value,
				platformCutBps: safe,
				allocation: rescaled,
			});
		},
		[onChange, value],
	);

	const setAllocation = useCallback(
		(key: keyof FourMemeTaxFeeConfig["allocation"], pct: number) => {
			const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
			const bps = Math.round(safePct * 100);
			onChange({
				...value,
				allocation: {
					...value.allocation,
					[key]: bps,
				},
			});
		},
		[onChange, value],
	);

	const rescaleToFit = useCallback(() => {
		onChange({
			...value,
			allocation: rescaleAllocation(value.allocation, expectedSum),
		});
	}, [expectedSum, onChange, value]);

	const setMinHolderBalance = useCallback(
		(minHolderBalance: string) => {
			onChange({ ...value, minHolderBalance });
		},
		[onChange, value],
	);

	return (
		<div className="flex flex-col gap-8">
			<TaxRateSelector taxBps={value.taxBps} onChange={setTax} />

			<PlatformCutSection
				taxBps={value.taxBps}
				platformCutBps={value.platformCutBps}
				platformCutVolumeBps={platformCutVolumeBps}
				onChange={setPlatformCut}
			/>

			<AllocationGrid
				allocation={value.allocation}
				allocationSum={allocationSum}
				expectedSum={expectedSum}
				sumOff={sumOff}
				onAllocationChange={setAllocation}
				onRescale={rescaleToFit}
			/>

			<MinHolderField value={value.minHolderBalance} onChange={setMinHolderBalance} />

			<ValidationBanners warnings={validation.warnings} errors={validation.errors} />

			<PlatformCutBreakdown
				taxBps={value.taxBps}
				platformCutBps={value.platformCutBps}
				platformCutVolumeBps={platformCutVolumeBps}
			/>
		</div>
	);
}
