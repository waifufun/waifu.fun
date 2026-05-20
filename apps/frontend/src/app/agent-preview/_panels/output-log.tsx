/**
 * Worker C - Output Log.
 *
 * Terminal-style stream of what Sol is currently doing. Each line:
 *   HH:MM:SS  [TAG]  message
 *
 * Tags are color-tinted so a skimmer can find SHIP / RISK / ANALYSIS
 * events without reading every line. Driven by buildOutputLog() which
 * derives lines from real ActivityItems today, and will hook into
 * Sol's runtime stdout once Steward exposes the SSE stream.
 */

"use client";

import { cn } from "@/lib/utils";

import type { LogLine } from "../lib/output-log";
import { Label, Panel, Pulse } from "./_primitives";

const TAG_TONE: Record<LogLine["tag"], string> = {
	SHIP: "text-[var(--positive)]",
	INFO: "text-[var(--text-secondary)]",
	VOICE: "text-sky-300",
	BUILD: "text-[var(--accent)]",
	TX: "text-amber-300",
	ANALYSIS: "text-blue-300",
	RISK: "text-yellow-300",
};

function pad2(n: number) {
	return n < 10 ? `0${n}` : String(n);
}

function formatClock(iso: string) {
	const d = new Date(iso);
	return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function OutputLog({ lines }: { lines: LogLine[] }) {
	return (
		<Panel>
			<Label
				right={
					<div className="flex items-center gap-3">
						<span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--positive)]">
							<Pulse tone="positive" /> live
						</span>
						<a
							href="/agent-preview/log"
							className={cn(
								"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
								"transition-colors hover:text-[var(--accent)]",
							)}
						>
							View All →
						</a>
					</div>
				}
			>
				Output Log
			</Label>

			<div
				className={cn(
					"-mx-1 rounded border border-[var(--border-soft)] bg-black/30 px-3 py-2.5",
					"font-mono text-[11px] leading-[1.7]",
				)}
			>
				{lines.length === 0 ? (
					<div className="py-2 text-center text-[var(--text-tertiary)]">stream idle</div>
				) : (
					<ul className="space-y-0.5">
						{lines.map((l) => (
							<li key={`${l.timestamp}-${l.tag}-${l.message}`} className="flex items-start gap-2 whitespace-nowrap">
								<span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">{formatClock(l.timestamp)}</span>
								<span
									className={cn(
										"shrink-0 uppercase tracking-[0.12em]",
										TAG_TONE[l.tag] ?? "text-[var(--text-secondary)]",
									)}
								>
									[{l.tag}]
								</span>
								<span className="min-w-0 truncate text-[var(--text-primary)]">{l.message}</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</Panel>
	);
}
