import {
	type BagsFeeConfig,
	type BankrFeeConfig,
	type FlapFeeConfig,
	type FourMemeTaxFeeConfig,
	MAX_PLATFORM_CUT_BPS,
	MIN_PLATFORM_CUT_BPS,
} from "./types";

export type ValidatorResult = {
	ok: boolean;
	errors: string[];
	warnings: string[];
};

/**
 * Returns the sum of all four allocation legs in bps.
 * Should equal (10000 - platformCutBps) under the flat-cut model.
 */
export function sumAllocationBps(a: FourMemeTaxFeeConfig["allocation"]): number {
	return a.founderBps + a.holderBps + a.burnBps + a.liquidityBps;
}

/**
 * The amount of total trade volume captured by the platform.
 * cutVolumeBps = (taxBps * platformCutBps) / 10000
 */
export function computePlatformCutVolumeBps(taxBps: number, platformCutBps: number): number {
	return Math.floor((taxBps * platformCutBps) / 10_000);
}

export function validateFourMemeTax(config: FourMemeTaxFeeConfig): ValidatorResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!Number.isInteger(config.platformCutBps) || config.platformCutBps < 0 || config.platformCutBps > 10_000) {
		errors.push("platform cut must be between 0% and 100%.");
	} else if (config.platformCutBps < MIN_PLATFORM_CUT_BPS) {
		warnings.push(
			`platform cut is ${(config.platformCutBps / 100).toFixed(2)}%, below the ${(MIN_PLATFORM_CUT_BPS / 100).toFixed(0)}% prod minimum.`,
		);
	} else if (config.platformCutBps > MAX_PLATFORM_CUT_BPS) {
		warnings.push(
			`platform cut is ${(config.platformCutBps / 100).toFixed(2)}%, above the ${(MAX_PLATFORM_CUT_BPS / 100).toFixed(0)}% prod maximum.`,
		);
	}

	const sum = sumAllocationBps(config.allocation);
	const expected = 10_000 - config.platformCutBps;
	if (sum !== expected) {
		errors.push(
			`allocations must sum to ${(expected / 100).toFixed(2)}% (100% minus platform cut). currently ${(sum / 100).toFixed(2)}%.`,
		);
	}

	if (
		config.allocation.founderBps < 0 ||
		config.allocation.holderBps < 0 ||
		config.allocation.burnBps < 0 ||
		config.allocation.liquidityBps < 0
	) {
		errors.push("allocations cannot be negative.");
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

	if (!Number.isInteger(config.platformCutBps) || config.platformCutBps < 0 || config.platformCutBps > 10_000) {
		errors.push("platform cut must be between 0% and 100%.");
	}

	if (config.recipient === "custom-vault") {
		const addr = config.customVaultAddress?.trim() ?? "";
		if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
			errors.push("custom vault address must be a valid 0x-prefixed address.");
		}
	}

	return { ok: errors.length === 0, errors, warnings };
}

function validateBankrFeeSplit(config: BankrFeeConfig): ValidatorResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!Number.isInteger(config.platformCutBps) || config.platformCutBps < 0 || config.platformCutBps > 3610) {
		errors.push("platform share must be between 0% and 36.10% for Bankr.");
	}
	if (config.creatorFeeBps !== 5700) {
		errors.push("creator share must be 57% for Bankr.");
	}
	return { ok: errors.length === 0, errors, warnings };
}

function validateBagsFeeSplit(config: BagsFeeConfig): ValidatorResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!Number.isInteger(config.platformCutBps) || config.platformCutBps < 0 || config.platformCutBps > 10_000) {
		errors.push("platform cut must be between 0% and 100%.");
	} else if (config.platformCutBps < MIN_PLATFORM_CUT_BPS) {
		warnings.push(`platform cut is below the ${(MIN_PLATFORM_CUT_BPS / 100).toFixed(0)}% prod minimum.`);
	} else if (config.platformCutBps > MAX_PLATFORM_CUT_BPS) {
		warnings.push(`platform cut is above the ${(MAX_PLATFORM_CUT_BPS / 100).toFixed(0)}% prod maximum.`);
	}
	if (!Number.isInteger(config.creatorFeeBps) || config.creatorFeeBps < 0 || config.creatorFeeBps > 10_000) {
		errors.push("creator share must be between 0% and 100%.");
	}
	if (config.creatorFeeBps + config.platformCutBps !== 10_000) {
		errors.push("creator share plus platform cut must equal 100%.");
	}
	if (!Number.isInteger(config.initialBuyLamports) || config.initialBuyLamports < 0) {
		errors.push("initial buy must be a non-negative lamport amount.");
	}
	return { ok: errors.length === 0, errors, warnings };
}

export function validateBankr(config: BankrFeeConfig): ValidatorResult {
	const split = validateBankrFeeSplit(config);
	if (config.feeRecipientType !== "wallet") split.errors.push("fee recipient must be a wallet.");
	return { ...split, ok: split.errors.length === 0 };
}

export function validateBags(config: BagsFeeConfig): ValidatorResult {
	return validateBagsFeeSplit(config);
}
