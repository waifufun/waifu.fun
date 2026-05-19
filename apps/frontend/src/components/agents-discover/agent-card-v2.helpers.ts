/**
 * Pure helpers extracted from agent-card-v2.tsx so they can be unit-tested
 * under vitest's node env (no jsdom for component rendering).
 */
import { TIER_DISPLAY_NAME, type TierId } from "@/components/create/tier/tier-data";

export function shortAddress(addr: string): string {
	if (!addr || addr.length < 11) return addr || "";
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export interface TierBadgeMeta {
	name: string;
	tone: string;
}

/**
 * Map a numeric tier id (80 / 90 / 95 / 98) to its display name + tone
 * classes. Tier intensity is encoded with luminance, not hue, so the
 * card respects the single-accent constraint (only the top tier earns
 * the green wash). SMOL / BASED / WAGMI step up in brightness; GIGACHAD
 * gets the accent because it has actually earned attention.
 */
export function tierDisplay(tier: number | null | undefined): TierBadgeMeta | null {
	if (tier == null) return null;
	const id = tier as TierId;
	const name = TIER_DISPLAY_NAME[id];
	if (!name) return null;
	switch (id) {
		case 80:
			return { name, tone: "border-white/15 text-white/55 bg-white/[0.02]" };
		case 90:
			return { name, tone: "border-white/25 text-white/70 bg-white/[0.04]" };
		case 95:
			return { name, tone: "border-white/35 text-white/85 bg-white/[0.06]" };
		case 98:
			return { name, tone: "border-[#00ff87]/50 text-[#00ff87] bg-[#00ff87]/[0.06]" };
		default:
			return { name, tone: "border-white/15 text-white/55 bg-white/[0.02]" };
	}
}

/**
 * Format a USD value into a compact form for stat cells. Returns "–" for
 * non-positive or non-finite inputs so the UI never shows "$0" or "$NaN".
 */
export function formatUsdShort(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "–";
	if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}b`;
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
	if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
	return `$${n.toFixed(0)}`;
}

/**
 * Format a count (holders, tx) into a compact form. Returns "–" for
 * negative or non-finite inputs; 0 stays as "0" since it's a meaningful
 * value for a freshly-launched agent.
 */
export function formatNumberShort(n: number): string {
	if (!Number.isFinite(n) || n < 0) return "–";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toLocaleString();
}
