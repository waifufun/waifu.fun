/**
 * Vanity address utilities for the Flap-native launch flow.
 *
 * Every Wave H launch has a CREATE2-mined token address ending in the
 * suffix `7777`. The salt is mined off-chain by the backend after a
 * user submits the wizard; it can take a few seconds. The frontend
 * shows a placeholder ("your token: 0x…7777") while mining, then
 * swaps in the real address once the backend returns it.
 *
 * Pure functions only — no React, no fetch. Easy to unit-test.
 */

export const VANITY_SUFFIX = "7777" as const;

export type VanityState =
	| { kind: "idle" } // no submission yet — show placeholder
	| { kind: "mining" } // backend is mining, spinner state
	| { kind: "ready"; address: `0x${string}` } // real address landed
	| { kind: "error"; message: string }; // backend gave up

/**
 * Normalise an address-ish input (case insensitive, optional 0x prefix
 * permissive). Returns null if the input doesn't look like an EVM
 * address. The check is loose on purpose — the backend is authoritative.
 */
function looksLikeAddress(value: unknown): value is string {
	if (typeof value !== "string") return false;
	return /^0x[a-fA-F0-9]{40}$/.test(value.toLowerCase());
}

/**
 * State transition: given the current vanity state and a freshly fetched
 * `predictedTokenAddress` from the launch row, derive the next state.
 *
 * - undefined / null while still mining → `mining`
 * - a string that doesn't pass `looksLikeAddress` → `error`
 * - a real address that ends with `7777` → `ready`
 * - a real address that ends in something else → `ready` but flagged
 *   (we still surface it; the suffix check is advisory)
 *
 * The `submitted` flag lets us distinguish "user hasn't started yet"
 * from "submitted, backend is working." Without it we couldn't tell
 * a fresh wizard from a stalled mine.
 */
export function nextVanityState(prev: VanityState, predicted: unknown, submitted: boolean): VanityState {
	if (!submitted) return { kind: "idle" };
	if (predicted === null || predicted === undefined || predicted === "") {
		return { kind: "mining" };
	}
	if (!looksLikeAddress(predicted)) {
		return { kind: "error", message: "backend returned a malformed token address" };
	}
	const normalised = predicted as string;
	// Preserve identity if the address didn't change — lets React skip rerenders.
	if (prev.kind === "ready" && prev.address.toLowerCase() === normalised.toLowerCase()) {
		return prev;
	}
	return { kind: "ready", address: normalised as `0x${string}` };
}

/**
 * Truncated form for display: `0x1234…7777`. Always preserves the
 * vanity suffix at the end so users see what they're getting.
 */
export function formatVanityAddress(address: string | null | undefined): string {
	if (!address) return `0x…${VANITY_SUFFIX}`;
	if (!looksLikeAddress(address)) return `0x…${VANITY_SUFFIX}`;
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * True when the given address ends in the canonical Flap-native vanity
 * suffix. The bundle router only sets `predictedTokenAddress` once
 * mining succeeds, so this should always be true in practice; we still
 * defend in case ops disables suffix-mining for an incident.
 */
export function hasVanitySuffix(address: string | null | undefined): boolean {
	if (!looksLikeAddress(address)) return false;
	return address.toLowerCase().endsWith(VANITY_SUFFIX);
}

/**
 * URL to the token on BscScan. Returns null when we don't have a real
 * address yet so callers can hide the link.
 */
export function bscscanTokenUrl(address: string | null | undefined): string | null {
	if (!looksLikeAddress(address)) return null;
	return `https://bscscan.com/token/${address}`;
}

/**
 * URL to the token's page on the Flap UI. Mirrors `bscscanTokenUrl` —
 * we surface this once the launch is `Launched`.
 */
export function flapTokenUrl(address: string | null | undefined): string | null {
	if (!looksLikeAddress(address)) return null;
	return `https://flap.sh/token/${address}`;
}

/**
 * URL to the PancakeSwap V2 pair info / swap UI for the token. The pair
 * address is graduated by Flap so we don't know it upfront; the launch
 * row will carry it after the bundle confirms.
 */
export function pancakeSwapUrl(tokenAddress: string | null | undefined): string | null {
	if (!looksLikeAddress(tokenAddress)) return null;
	return `https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`;
}
