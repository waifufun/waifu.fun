/**
 * Shared formatters for the W51 patron dashboard.
 *
 * Centralized here so PortfolioStats, LaunchPositionRow and HistoryTable
 * stay visually consistent without each component cooking its own number
 * formatter (we had three different `formatBnb` impls before this).
 */
import { formatEther } from "viem";

/** Format a wei bigint as a human-friendly bnb string. */
export function formatBnb(wei: bigint | string | null | undefined, digits?: number): string {
	if (wei === null || wei === undefined) return "0";
	let value: bigint;
	try {
		value = typeof wei === "bigint" ? wei : BigInt(wei);
	} catch {
		return "0";
	}
	const ether = formatEther(value);
	const num = Number(ether);
	if (!Number.isFinite(num)) return ether;
	if (num === 0) return "0";
	if (digits !== undefined) return num.toFixed(digits);
	if (num >= 1000) return num.toFixed(1);
	if (num >= 1) return num.toFixed(3);
	if (num >= 0.001) return num.toFixed(4);
	return num.toFixed(6);
}

/** Format a token-wei bigint (assumes 18 decimals) as a token amount. */
export function formatTokens(wei: bigint | string | null | undefined): string {
	return formatBnb(wei);
}

/**
 * Convert a token allocation (wei) to its implied bnb value at the v2
 * opening market cap. `openMcBnb` is the project market cap in wei
 * (TOTAL_SUPPLY * priceBnb). We compute the user share via:
 *
 *   value = openMcBnb * tokenAlloc / TOTAL_SUPPLY
 *
 * If we don't have an open MC yet (pre-launch), this returns null and the
 * caller can fall back to "deposited" as the unrealized basis.
 *
 * TOTAL_SUPPLY for agent launches is hardcoded at 1B with 18 decimals
 * (matches LaunchVault.sol; see W42 spec).
 */
const TOTAL_SUPPLY_WEI = 1_000_000_000n * 10n ** 18n;

export function impliedBnbValue(allocationWei: string | null, openMcBnbWei: string | null): bigint | null {
	if (!allocationWei || !openMcBnbWei) return null;
	try {
		const alloc = BigInt(allocationWei);
		const mc = BigInt(openMcBnbWei);
		if (alloc === 0n || mc === 0n) return 0n;
		return (mc * alloc) / TOTAL_SUPPLY_WEI;
	} catch {
		return null;
	}
}

/** Render a percentage (0..100) with one decimal of precision. */
export function formatPct(value: number): string {
	if (!Number.isFinite(value)) return "0%";
	return `${value.toFixed(1)}%`;
}

/** Render an unsigned (or signed) bnb delta with sign prefix. */
export function formatBnbDelta(deltaWei: bigint): string {
	const sign = deltaWei < 0n ? "-" : "+";
	const abs = deltaWei < 0n ? -deltaWei : deltaWei;
	if (abs === 0n) return "0";
	return `${sign}${formatBnb(abs)}`;
}
