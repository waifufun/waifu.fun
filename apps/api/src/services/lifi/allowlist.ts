/**
 * Li.Fi Phase 2 MVP bridge allowlist.
 *
 * Pinned from PHASE-1-SPIKE-2026-05-22.md after the research spike. Only
 * the tool keys listed here are allowed to surface as quote routes. Any
 * quote that uses an off-list bridge is rejected upstream with 400 so the
 * patron is never asked to sign through an unvetted aggregator.
 *
 * Conditional tools (relay capped, mayanMCTP slow, eco scope-limited) are
 * tagged so the caller can apply extra rules; the base allowlist check is
 * still "is the key in this set".
 */

export const LIFI_BRIDGE_ALLOWLIST = [
	"across",
	"hyperliquidNative",
	"relaydepository",
	"celercircle",
	"celercirclefast",
	"mayanMCTP",
	"eco",
] as const;

export type LifiBridgeKey = (typeof LIFI_BRIDGE_ALLOWLIST)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(LIFI_BRIDGE_ALLOWLIST);

export function isBridgeAllowed(key: string | undefined | null): key is LifiBridgeKey {
	if (!key) return false;
	return ALLOWED_SET.has(key);
}

export interface BridgeRouteContext {
	fromChain: number;
	toChain: number;
	fromTokenSymbol: string | undefined;
	toTokenSymbol: string | undefined;
	estimatedUsd: number | undefined;
}

const BSC_CHAIN_ID = 56;
const ARB_CHAIN_ID = 42_161;
const RELAY_CAP_USD = 1_000;

/**
 * Per-tool guards we apply on top of the base allowlist. The check returns
 * a string error code on rejection or null when the route is acceptable.
 *
 * `eco` is BSC USDT -> Arb USDC only (per the spike, that pair is its only
 * proven route for us). `relaydepository` is capped at $1000 in MVP.
 * `mayanMCTP` is allowed but exposes a long ETA which the UI surfaces.
 */
export function checkConditionalRules(tool: LifiBridgeKey, ctx: BridgeRouteContext): string | null {
	if (tool === "eco") {
		const isBscUsdtToArbUsdc =
			ctx.fromChain === BSC_CHAIN_ID &&
			ctx.toChain === ARB_CHAIN_ID &&
			ctx.fromTokenSymbol?.toUpperCase() === "USDT" &&
			ctx.toTokenSymbol?.toUpperCase() === "USDC";
		if (!isBscUsdtToArbUsdc) {
			return "ECO_SCOPE_DENIED";
		}
	}
	if (tool === "relaydepository") {
		if (ctx.estimatedUsd !== undefined && Number.isFinite(ctx.estimatedUsd) && ctx.estimatedUsd > RELAY_CAP_USD) {
			return "RELAY_CAP_EXCEEDED";
		}
	}
	return null;
}
