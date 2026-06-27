/**
 * Sunset agents: tokens that have been wound down.
 *
 * An agent whose token address is in this set is rendered in `sunset` state on
 * its agent page — the SunsetBanner shows and the price-chart + swap surface is
 * suppressed (trading is closed; the chart is no longer meaningful). The agent
 * itself lives on; only the token is retired.
 *
 * This is config, not logic scattered through the page — add an address here to
 * sunset a token's surface. Addresses are compared lowercased.
 */

const SUNSET_AGENT_ADDRESSES = new Set<string>([
	// $WAIFU (Sol the Architect) — token sunset 2026-06-26, treasury wound down,
	// holders reconciled pro-rata on-chain.
	"0x15fc6086064afe50ccf4c70000c55cecb6e17777",
]);

export function isSunsetAgent(tokenAddress: string | undefined | null): boolean {
	if (!tokenAddress) return false;
	return SUNSET_AGENT_ADDRESSES.has(tokenAddress.toLowerCase());
}
