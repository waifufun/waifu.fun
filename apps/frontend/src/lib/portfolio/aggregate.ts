/**
 * Portfolio-level aggregations across all of a patron's launch positions.
 *
 * Math:
 *   - invested  = SUM(net deposit, in BNB)              (still-active capital)
 *   - realized  = SUM(claimed implied BNB value)        (post-launch claims)
 *   - unrealized = SUM(remaining alloc implied BNB value)
 *
 * `realized` and `unrealized` need an opening market cap to convert
 * tokens back to BNB. When `openMcBnb` is missing on a launch (pre-bundle
 * or non-graduated), that launch contributes nothing to those totals,
 * which is correct — we don't have a price yet.
 */
import type { UserLaunchEntry } from "@/lib/api/portfolio";

import { impliedBnbValue } from "./format";

export type PortfolioTotals = {
	investedWei: bigint;
	realizedWei: bigint;
	unrealizedWei: bigint;
	totalAllocationTokens: bigint;
	claimableTokens: bigint;
	count: number;
};

export function aggregatePortfolio(entries: UserLaunchEntry[]): PortfolioTotals {
	let investedWei = 0n;
	let realizedWei = 0n;
	let unrealizedWei = 0n;
	let totalAllocationTokens = 0n;
	let claimableTokens = 0n;

	for (const entry of entries) {
		try {
			investedWei += BigInt(entry.position.deposited || "0");
		} catch {
			/* skip malformed */
		}

		const openMc = entry.launch.openMcBnb;
		if (entry.launch.state === "launched" && openMc) {
			// Realized: claimed tokens valued at opening MC.
			const claimedValue = impliedBnbValue(entry.position.claimed, openMc);
			if (claimedValue) realizedWei += claimedValue;

			// Unrealized: alloc that hasn't been claimed yet, valued at opening MC.
			if (entry.position.totalAllocation) {
				try {
					const alloc = BigInt(entry.position.totalAllocation);
					const claimed = BigInt(entry.position.claimed || "0");
					const remaining = alloc > claimed ? alloc - claimed : 0n;
					const remainingValue = impliedBnbValue(remaining.toString(), openMc);
					if (remainingValue) unrealizedWei += remainingValue;
				} catch {
					/* skip */
				}
			}
		}

		try {
			if (entry.position.totalAllocation) {
				totalAllocationTokens += BigInt(entry.position.totalAllocation);
			}
			if (entry.position.claimable) {
				claimableTokens += BigInt(entry.position.claimable);
			}
		} catch {
			/* skip */
		}
	}

	return {
		investedWei,
		realizedWei,
		unrealizedWei,
		totalAllocationTokens,
		claimableTokens,
		count: entries.length,
	};
}
