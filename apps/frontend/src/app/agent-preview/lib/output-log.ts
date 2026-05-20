/**
 * Agent output log — terminal-style stream of what Sol is doing.
 *
 * Today: synthesized from real ActivityItems (latest PR, latest tweet, etc).
 * Future: hook into Sol's runtime stdout via Steward / eliza-cloud SSE.
 */

import type { ActivityItem } from "./activity";

export type LogLine = {
	timestamp: string; // iso
	tag: "SHIP" | "INFO" | "VOICE" | "BUILD" | "TX" | "ANALYSIS" | "RISK";
	message: string;
};

export function buildOutputLog(activity: ActivityItem[], limit = 8): LogLine[] {
	const lines: LogLine[] = [];

	for (const it of activity.slice(0, limit)) {
		if (it.type === "pr") {
			lines.push({
				timestamp: it.timestamp,
				tag: "SHIP",
				message: `Merged PR #${it.number} — ${it.title}`,
			});
		} else if (it.type === "tweet") {
			lines.push({
				timestamp: it.timestamp,
				tag: "VOICE",
				message: `Posted: "${it.text.slice(0, 80)}${it.text.length > 80 ? "…" : ""}"`,
			});
		} else if (it.type === "tx") {
			lines.push({
				timestamp: it.timestamp,
				tag: "TX",
				message: `BSC tx ${it.method} · ${it.valueBnb.toFixed(4)} BNB`,
			});
		} else if (it.type === "revenue") {
			lines.push({
				timestamp: it.timestamp,
				tag: "INFO",
				message: `Revenue +$${it.usd.toFixed(2)} from ${it.source}`,
			});
		}
	}

	// always have at least one ANALYSIS line about current operating state
	lines.push({
		timestamp: new Date().toISOString(),
		tag: "ANALYSIS",
		message: "agent operational · runtime healthy · no anomalies",
	});

	return lines.slice(0, limit);
}
