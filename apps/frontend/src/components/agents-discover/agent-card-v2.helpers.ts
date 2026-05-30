/**
 * Pure helpers extracted from agent-card-v2.tsx so they can be unit-tested
 * under vitest's node env (no jsdom for component rendering).
 */
import { TIER_DISPLAY_NAME, type TierId } from "@/components/create/tier/tier-data";
import { tierFromString } from "@/lib/launch-vault/tiers";

export function shortAddress(addr: string): string {
	if (!addr || addr.length < 11) return addr || "";
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Resolve the API's raw tier identifier to a numeric tier id (80/90/95/98)
 * that {@link tierDisplay} understands.
 *
 * The agent_launches serialize emits the string label ("TIER_95") by
 * default (see apps/api/src/routes/v2/agent-launches.ts:serializeAgentLaunch),
 * not the numeric 95 that tierDisplay expects. Passing the raw string
 * silently returned null and the tier badge vanished from the homepage
 * agent card. Matches the PR #677 fix pattern used in launch-card.
 */
export function resolveTierId(raw: string | number | null | undefined): number | null {
	if (raw === null || raw === undefined || raw === "") return null;
	if (typeof raw === "number" && Number.isFinite(raw)) {
		// Direct match against the public tier numbers; collapse anything
		// else through the string parser so we never feed `tierDisplay` an
		// unknown numeric (e.g. the on-chain enum index 2) and silently
		// render nothing.
		if (raw === 80 || raw === 90 || raw === 95 || raw === 98) return raw;
	}
	const info = tierFromString(typeof raw === "number" ? `tier_${raw}` : raw);
	if (!info) return null;
	const match = info.id.match(/^TIER_(\d{2})$/);
	if (!match || !match[1]) return null;
	return Number.parseInt(match[1], 10);
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
 * Format a USD value into a compact form for stat cells. Returns a middot
 * for non-positive or non-finite inputs so the UI never shows "$0" or
 * "$NaN". The middot is the wave-t empty-cell glyph; en/em-dash glyphs are
 * banned as placeholders (.impeccable.md).
 */
export function formatUsdShort(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "·";
	if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}b`;
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
	if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
	return `$${n.toFixed(0)}`;
}

/**
 * Format a count (holders, tx) into a compact form. Returns a middot for
 * negative or non-finite inputs; 0 stays as "0" since it's a meaningful
 * value for a freshly-launched agent.
 */
export function formatNumberShort(n: number): string {
	if (!Number.isFinite(n) || n < 0) return "·";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toLocaleString();
}

/**
 * Format a signed percentage for the 24h stat cell.
 */
export function formatPercentShort(n: number): string {
	if (!Number.isFinite(n)) return "·";
	const sign = n > 0 ? "+" : "";
	const abs = Math.abs(n);
	const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
	return `${sign}${n.toFixed(digits)}%`;
}
