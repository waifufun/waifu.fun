/**
 * hero-copy. Pure functions that turn an AgentData + launch slice into the
 * narrative bits the hero renders:
 *
 *   - buildLede           one-sentence editorial intro that positions THIS
 *                         agent (not "an AI agent on waifu.fun")
 *   - buildStatusMoment   live / day N / last action chip group
 *   - buildSignatureStat  one editorial number above the fold (PATRON YIELD,
 *                         DAY COUNTER, VAULT TIME LEFT, AGENT'S TAKE)
 *
 * Kept in its own file because:
 *   1. content shape is the heart of the redesign (per Shadow's brief:
 *      "ledes that earn the page")
 *   2. unit tests live next to it (hero-copy.test.ts) so we can iterate
 *      on the narrative without spinning up a render harness
 *   3. the hero stays a thin presentational component
 *
 * Style discipline: no exclamation marks, no em-dashes, all lowercase
 * outside of TICKERS and brand caps (WAIFU FLAP BNB BSC PCS AgentSafe
 * TaxSplitter TreasuryLP). Numbers use tabular-num formatting.
 */

import type { AgentLaunchHeroSlice } from "./agent-hero-v2";
import type { AgentData } from "./types";

const DAY_MS = 1000 * 60 * 60 * 24;
const HOUR_MS = 1000 * 60 * 60;
const MINUTE_MS = 1000 * 60;

export interface HeroContext {
	agent: AgentData;
	launch: AgentLaunchHeroSlice | null;
}

export interface StatusMoment {
	state: string;
	parts: string[];
}

export interface SignatureStat {
	label: string;
	value: string;
	tone?: "accent" | "neutral";
}

/**
 * The lede sentence. Calm, specific, positions the agent in one line. Falls
 * back to nothing when there's not enough data to say something true (we'd
 * rather show nothing than a generic platform tagline).
 */
export function buildLede({ agent, launch }: HeroContext): string | null {
	const days = daysSinceLaunch(launch);
	const split = launch?.taxSplit ?? null;
	const agentBpsPct = split ? Math.round(split.agentBps / 100) : null;
	const patronCount = launch?.depositorCount ?? null;
	const graduated = agent.status === "graduated";

	if (graduated && days != null && days >= 1) {
		const burned = "burns flow back through the LP";
		if (agentBpsPct != null) {
			return `${days} days past graduation. ${agentBpsPct}% of every trade tax routes back to ${shortName(agent)}, the rest funds patrons and the platform.`;
		}
		return `${days} days past graduation. ${burned} and the agent keeps the room lit.`;
	}

	if (launch && (launch.state === "open" || launch.state === "closed") && launch.closeTimestamp) {
		const closesIn = relativeWindow(launch.closeTimestamp * 1000 - Date.now());
		if (patronCount != null && patronCount > 0) {
			return `vault is open. ${patronCount} ${patronCount === 1 ? "patron" : "patrons"} in, ${closesIn} to close, ${agentBpsPct ?? 65}% of trade tax will route to ${shortName(agent)}.`;
		}
		return `vault opens with ${closesIn} on the clock. first patrons set the floor; ${agentBpsPct ?? 65}% of trade tax will route back to the agent.`;
	}

	if (launch && launch.state === "launched" && days != null) {
		if (patronCount != null && patronCount > 0) {
			return `${days} days post-curve. ${patronCount} ${patronCount === 1 ? "patron" : "patrons"} hold the agent safe and ${agentBpsPct ?? 65}% of trade tax routes back to ${shortName(agent)}.`;
		}
		return `${days} days post-curve. liquidity is live and ${agentBpsPct ?? 65}% of trade tax routes back to ${shortName(agent)}.`;
	}

	// no launch row: keep it short and honest
	if (agent.description) return null;

	return `${shortName(agent)} runs onchain, posts in the open, and ships from their own wallet.`;
}

/**
 * The status moment: live + day counter + last action. Two or three short
 * chips. Reads as "alive" rather than "label: value".
 */
export function buildStatusMoment({ agent, launch }: HeroContext): StatusMoment {
	const graduated = agent.status === "graduated";
	const pending = agent.status === "pending";
	const state = graduated ? "graduated" : pending ? "pending" : "online";

	const parts: string[] = [];
	const days = daysSinceLaunch(launch);
	if (graduated && days != null) {
		parts.push(`day ${days}`);
	} else if (launch?.state === "open" && launch.closeTimestamp) {
		const ms = launch.closeTimestamp * 1000 - Date.now();
		if (ms > 0) parts.push(`closes in ${relativeWindow(ms)}`);
	} else if (days != null) {
		parts.push(`day ${days}`);
	}

	if (typeof launch?.depositorCount === "number" && launch.depositorCount > 0) {
		parts.push(`${launch.depositorCount} ${launch.depositorCount === 1 ? "patron" : "patrons"}`);
	}

	if (agent.lastActionAt) {
		parts.push(`last move ${relativePast(agent.lastActionAt)}`);
	}

	return { state, parts };
}

/**
 * The one editorial stat that earns its space above the fold. Chosen by
 * priority:
 *   1. vault countdown if we're pre-launch with a deadline
 *   2. agent's tax take percentage (if split exists and agent has earned)
 *   3. days since launch (post-curve life)
 *   4. nothing (we don't fake a stat)
 */
export function buildSignatureStat({ agent, launch }: HeroContext): SignatureStat | null {
	const graduated = agent.status === "graduated";
	const days = daysSinceLaunch(launch);
	const split = launch?.taxSplit ?? null;
	const agentBpsPct = split ? split.agentBps / 100 : null;

	if (launch && launch.state === "open" && launch.closeTimestamp) {
		const ms = launch.closeTimestamp * 1000 - Date.now();
		if (ms > 0) {
			return {
				label: "vault closes in",
				value: relativeWindow(ms),
			};
		}
	}

	if (graduated && agentBpsPct != null) {
		return {
			label: "agent's take",
			value: `${formatPct(agentBpsPct)} of trade tax`,
			tone: "accent",
		};
	}

	if (launch && launch.state === "launched" && days != null && days > 0) {
		return {
			label: "post-curve",
			value: `day ${days}`,
		};
	}

	if (agentBpsPct != null) {
		return {
			label: "agent's take",
			value: `${formatPct(agentBpsPct)} of trade tax`,
		};
	}

	return null;
}

// ---------------- helpers ----------------

function shortName(agent: AgentData): string {
	const trimmed = agent.name?.trim();
	if (!trimmed) return `$${agent.ticker || "agent"}`;
	const first = trimmed.split(/\s+/)[0] ?? "";
	return first.length > 0 ? first.toLowerCase() : trimmed.toLowerCase();
}

function daysSinceLaunch(launch: AgentLaunchHeroSlice | null): number | null {
	if (!launch?.launchTimestamp) return null;
	const ms = Date.now() - launch.launchTimestamp * 1000;
	if (ms <= 0) return 0;
	return Math.floor(ms / DAY_MS);
}

/** Past tense, compact: "47m ago", "3h ago", "2d ago". */
function relativePast(ts: number): string {
	const ms = ts > 1e12 ? ts : ts * 1000;
	const diff = Date.now() - ms;
	if (diff < 0) return "just now";
	if (diff < MINUTE_MS) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
	if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
	if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
	return `${Math.floor(diff / DAY_MS)}d ago`;
}

/** Forward-looking window: "18h", "3d 4h", "47m". */
function relativeWindow(ms: number): string {
	if (ms <= 0) return "0s";
	if (ms < HOUR_MS) return `${Math.max(1, Math.floor(ms / MINUTE_MS))}m`;
	if (ms < DAY_MS) {
		const h = Math.floor(ms / HOUR_MS);
		const m = Math.floor((ms % HOUR_MS) / MINUTE_MS);
		return m > 0 && h < 6 ? `${h}h ${m}m` : `${h}h`;
	}
	const d = Math.floor(ms / DAY_MS);
	const h = Math.floor((ms % DAY_MS) / HOUR_MS);
	return h > 0 && d < 3 ? `${d}d ${h}h` : `${d}d`;
}

function formatPct(pct: number): string {
	if (!Number.isFinite(pct)) return "0%";
	if (Number.isInteger(pct)) return `${pct}%`;
	return `${pct.toFixed(1)}%`;
}
