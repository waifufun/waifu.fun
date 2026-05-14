/**
 * Pure formatting helpers for the post-launch surface.
 *
 * Kept in a separate file (no react / wagmi imports) so they are easy to
 * unit-test under vitest's `node` environment without spinning up jsdom.
 */
import { formatEther, formatUnits } from "viem";

/**
 * Format a token amount (bigint, 18-dec by default) into a grouped
 * decimal string with at most `maxFracDigits` fractional digits and
 * trailing-zero trimming.
 *
 * formatTokenAmount(1_234_567_000_000_000_000_000n, 18) === "1,234.56"
 * formatTokenAmount(1_000_000_000_000_000_000n, 18) === "1"
 */
export function formatTokenAmount(value: bigint, decimals = 18, maxFracDigits = 2): string {
	const whole = formatUnits(value, decimals);
	const [intPart, fracPart] = whole.split(".");
	const grouped = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	if (!fracPart || /^0+$/.test(fracPart)) return grouped;
	const sliced = fracPart.slice(0, Math.max(0, maxFracDigits)).replace(/0+$/, "");
	return sliced.length === 0 ? grouped : `${grouped}.${sliced}`;
}

/**
 * Format BNB wei to a short decimal string ("0.0123") with at most 4
 * fractional digits, no grouping (BNB amounts are rarely large enough).
 */
export function formatBnb(value: bigint, maxFracDigits = 4): string {
	const s = formatEther(value);
	const [intPart, fracPart] = s.split(".");
	if (!fracPart) return intPart ?? "0";
	return `${intPart}.${fracPart.slice(0, maxFracDigits)}`;
}

/**
 * Compress a USD number to compact notation, k / m / b. Designed for the
 * tier ladder where targets span $50k - $50m. Inputs of NaN, Infinity, or
 * <= 0 map to "$0".
 */
export function formatUsdCompact(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "$0";
	if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}b`;
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
	return `$${value.toFixed(0)}`;
}

/**
 * Same compaction but for a chainlink-style 1e8 bigint USD value. We
 * downcast through Number once because the magnitudes we care about
 * (<= $50b) fit comfortably in a double.
 */
export function formatUsdFromChainlink(value: bigint): string {
	return formatUsdCompact(Number(value) / 1e8);
}

/**
 * Compute the burned percentage of supply, bigint-safe (no float math
 * until the final step). Returns 0 if supply is 0.
 */
export function burnedPercent(burned: bigint, supply: bigint): number {
	if (supply <= 0n) return 0;
	return Number((burned * 10000n) / supply) / 100;
}

/**
 * Truncate an 0x address to "0xabcd…wxyz" for compact UI. Returns the
 * input untouched if it doesn't look like an address.
 */
export function shortAddress(addr: string | null | undefined): string {
	if (!addr) return "";
	if (addr.length < 12) return addr;
	return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

/**
 * Compute vested pct + remaining seconds for the 50/50/24h vesting policy
 * baked into LaunchVault. `nowSeconds` is injectable for tests.
 */
export function vestingProgress(
	launchTimestamp: number,
	nowSeconds: number,
	tgeBps = 5000,
	windowSecs = 24 * 60 * 60,
): { pct: number; remainingSecs: number } {
	const elapsed = Math.max(0, nowSeconds - launchTimestamp);
	if (elapsed >= windowSecs) return { pct: 100, remainingSecs: 0 };
	const linearShare = ((10000 - tgeBps) * elapsed) / windowSecs;
	const pct = (tgeBps + linearShare) / 100;
	return { pct, remainingSecs: windowSecs - elapsed };
}

/**
 * Format USD volume numbers from DEXScreener as compact strings. Returns
 * "\u2013" for null / non-positive (so the UI renders a dash, not "$0").
 */
export function formatVolumeUsd(value: number | null): string {
	if (value === null || !Number.isFinite(value) || value <= 0) return "\u2013";
	return formatUsdCompact(value);
}
