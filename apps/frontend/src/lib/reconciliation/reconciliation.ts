/**
 * $WAIFU reconciliation eligibility.
 *
 * The token was wound down (sunset 2026-06-26). The agent treasury sale
 * proceeds (~38.77 BNB) are being distributed back to holders pro-rata, based
 * on a snapshot taken at the block before the agent sale, net of any BNB a
 * wallet already realized by selling. This module is the read-only eligibility
 * lookup for the registration page; the actual payout is settled separately
 * (manual for presale, merkle contract for the rest).
 */

import data from "./waifu-eligibility.json";

export interface EligibilityData {
	snapshot_block: number;
	pot_bnb: number;
	total_payout_bnb: number;
	count: number;
	eligible: Record<string, number>;
}

const ELIGIBILITY = data as EligibilityData;

export interface EligibilityResult {
	eligible: boolean;
	address: string;
	amountBnb: number;
}

/** Look up a wallet's reconciliation eligibility. Case-insensitive. */
export function checkEligibility(address: string | undefined | null): EligibilityResult | null {
	if (!address) return null;
	const key = address.toLowerCase();
	const amount = ELIGIBILITY.eligible[key];
	return {
		eligible: typeof amount === "number" && amount > 0,
		address: key,
		amountBnb: typeof amount === "number" ? amount : 0,
	};
}

export function reconciliationSummary(): {
	snapshotBlock: number;
	potBnb: number;
	totalPayoutBnb: number;
	eligibleCount: number;
} {
	return {
		snapshotBlock: ELIGIBILITY.snapshot_block,
		potBnb: ELIGIBILITY.pot_bnb,
		totalPayoutBnb: ELIGIBILITY.total_payout_bnb,
		eligibleCount: ELIGIBILITY.count,
	};
}

/**
 * The message a holder signs to book their reconciliation spot. Signing proves
 * control of the wallet + records the destination address for the payout. No
 * on-chain action, no gas — just an attestation we collect during the window.
 */
export function buildReconciliationMessage(args: {
	address: string;
	amountBnb: number;
	origin: string;
	issuedAt: string;
}): string {
	return [
		"$WAIFU reconciliation claim registration",
		"",
		"I confirm this wallet is my destination for the $WAIFU wind-down reconciliation.",
		"",
		`Wallet: ${args.address}`,
		`Eligible amount: ${args.amountBnb} BNB`,
		`Site: ${args.origin}`,
		`Issued: ${args.issuedAt}`,
		"",
		"Signing is free and off-chain. It books my spot for the distribution.",
	].join("\n");
}
