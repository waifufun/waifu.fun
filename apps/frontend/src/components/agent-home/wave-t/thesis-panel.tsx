/**
 * Thesis panel.
 *
 * Tight one-card thesis: how the agent's economics work, in one breath.
 * No 3-column dashboard treatment, no "what could go wrong" copy, no
 * marketing prose. Just the tax split + a single line about what the
 * agent does.
 *
 * Numbers come from the bonding curve / tax stream contract parameters.
 * If those move, edit them here.
 */

"use client";

import { Label, Panel } from "./_primitives";

export function ThesisPanel({
	taxBuyBps = 300,
	taxSellBps = 300,
	patronShareBps = 2500,
	agentShareBps = 6500,
	platformShareBps = 1000,
	ticker,
}: {
	taxBuyBps?: number;
	taxSellBps?: number;
	patronShareBps?: number;
	agentShareBps?: number;
	platformShareBps?: number;
	hasLiveRevenue?: boolean;
	ticker?: string;
}) {
	const taxBuyPct = (taxBuyBps / 100).toFixed(0);
	const taxSellPct = (taxSellBps / 100).toFixed(0);
	const patronPct = (patronShareBps / 100).toFixed(0);
	const agentPct = (agentShareBps / 100).toFixed(0);
	const platformPct = (platformShareBps / 100).toFixed(0);
	const tickerLabel = ticker ? `$${ticker.toUpperCase()}` : "the token";

	const splits: { label: string; pct: string; tone: "accent" | "muted" }[] = [
		{ label: "agent treasury", pct: agentPct, tone: "accent" },
		{ label: "patron", pct: patronPct, tone: "accent" },
		{ label: "platform", pct: platformPct, tone: "muted" },
		{ label: "holders", pct: "0", tone: "muted" },
	];

	return (
		<Panel className="flex h-full flex-col">
			<div className="flex items-center justify-between">
				<Label className="mb-0">thesis</Label>
				<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					tax · {taxBuyPct}/{taxSellPct}
				</span>
			</div>
			<p className="mt-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
				every buy and sell on {tickerLabel} feeds a tax stream. the agent compounds it into runway, positions, and
				shipped product. holders bet on the agent growing the pie.
			</p>
			<div className="mt-5 grid grid-cols-4 gap-2">
				{splits.map((s) => (
					<div
						key={s.label}
						className="flex flex-col gap-1 border-l border-[var(--border-subtle)] pl-3 first:border-l-0 first:pl-0"
					>
						<span
							className={
								s.tone === "accent"
									? "font-mono text-lg tabular-nums text-[var(--accent)]"
									: "font-mono text-lg tabular-nums text-[var(--text-primary)]"
							}
						>
							{s.pct}%
						</span>
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							{s.label}
						</span>
					</div>
				))}
			</div>
		</Panel>
	);
}

export default ThesisPanel;
