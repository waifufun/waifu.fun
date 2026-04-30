import {
	type FlapFeeConfig,
	type FourMemeTaxFeeConfig,
	PLATFORM_CUT_OF_FOUNDER_BPS,
	PLATFORM_FLOOR_BPS,
} from "./types";

export type ValidatorResult = {
	ok: boolean;
	errors: string[];
	warnings: string[];
};

/**
 * Returns the sum of all four allocation legs in bps.
 * 10000 = perfectly 100%. Any other value should fail validation.
 */
export function sumAllocationBps(a: FourMemeTaxFeeConfig["allocation"]): number {
	return a.founderBps + a.holderBps + a.burnBps + a.liquidityBps;
}

/**
 * Computes the platform cut as a fraction of total trade volume in bps.
 * cut = (taxBps / 10000) * (founderBps / 10000) * (PLATFORM_CUT_OF_FOUNDER_BPS / 10000)
 *     in bps:
 * cutBps = (taxBps * founderBps * PLATFORM_CUT_OF_FOUNDER_BPS) / 100_000_000
 *
 * Math kept in integer bps to avoid float drift.
 */
export function computePlatformCutBps(taxBps: number, founderBps: number): number {
	return Math.floor((taxBps * founderBps * PLATFORM_CUT_OF_FOUNDER_BPS) / 100_000_000);
}

/**
 * Minimum founderBps required to clear the platform floor at a given taxBps.
 *
 *   PLATFORM_FLOOR_BPS = (taxBps * founderBps * PLATFORM_CUT_OF_FOUNDER_BPS) / 100_000_000
 *   → founderBps_min   = ceil(PLATFORM_FLOOR_BPS * 100_000_000 / (taxBps * PLATFORM_CUT_OF_FOUNDER_BPS))
 *
 * Capped at 10000 (cannot exceed 100%).
 */
export function minFounderBpsForFloor(taxBps: number): number {
	if (taxBps <= 0) return 10_000;
	const numerator = PLATFORM_FLOOR_BPS * 100_000_000;
	const denominator = taxBps * PLATFORM_CUT_OF_FOUNDER_BPS;
	const min = Math.ceil(numerator / denominator);
	return Math.min(min, 10_000);
}

export function validateFourMemeTax(config: FourMemeTaxFeeConfig): ValidatorResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const sum = sumAllocationBps(config.allocation);

	if (sum !== 10_000) {
		errors.push(`allocations must sum to 100%. currently ${(sum / 100).toFixed(2)}%.`);
	}

	if (
		config.allocation.founderBps < 0 ||
		config.allocation.holderBps < 0 ||
		config.allocation.burnBps < 0 ||
		config.allocation.liquidityBps < 0
	) {
		errors.push("allocations cannot be negative.");
	}

	const cutBps = computePlatformCutBps(config.taxBps, config.allocation.founderBps);
	if (cutBps < PLATFORM_FLOOR_BPS) {
		const minFounder = minFounderBpsForFloor(config.taxBps);
		warnings.push(
			`platform cut is ${(cutBps / 100).toFixed(2)}% of trade volume, below the 0.5% prod floor. bump founder allocation to at least ${(minFounder / 100).toFixed(0)}%.`,
		);
	}

	const balanceNum = Number(config.minHolderBalance);
	if (!Number.isFinite(balanceNum) || balanceNum < 0) {
		errors.push("min holder balance must be a non-negative number.");
	}

	return { ok: errors.length === 0, errors, warnings };
}

export function validateFlap(config: FlapFeeConfig): ValidatorResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (config.recipient === "custom-vault") {
		const addr = config.customVaultAddress?.trim() ?? "";
		if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
			errors.push("custom vault address must be a valid 0x-prefixed address.");
		}
	}

	return { ok: errors.length === 0, errors, warnings };
}
