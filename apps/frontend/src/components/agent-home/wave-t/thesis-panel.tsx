/**
 * Thesis panel.
 *
 * Tells visitors how the agent earns and how holders share in that
 * income. Lowercase mono in wave-t grammar, not VC pitch copy: numbers
 * are concrete, claims are bounded by what the protocol actually does.
 *
 * Three columns (collapses on mobile):
 *   1. how the agent earns    -> tax stream + treasury growth + runway
 *   2. how holders earn       -> patron / agent / platform split
 *   3. risk                   -> honest, non-zero-day caveats
 *
 * Pulled directly from the wave-M tax router design + the post-launch
 * split published in `apps/contracts/contracts/TaxStream.sol`. If those
 * numbers shift, this file is the canonical UI mirror.
 */

"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Label, Panel } from "./_primitives";

type ThesisColumn = {
	title: string;
	rows: ThesisRow[];
};

type ThesisRow = {
	label: string;
	/** Primary number, mono tabular */
	value: ReactNode;
	/** Trailing context after the value */
	hint?: ReactNode;
	tone?: "neutral" | "accent" | "positive";
};

function ThesisRowEl({ row, isFirst }: { row: ThesisRow; isFirst: boolean }) {
	const tone =
		row.tone === "accent"
			? "text-[var(--accent)]"
			: row.tone === "positive"
				? "text-[var(--positive)]"
				: "text-[var(--text-primary)]";
	return (
		<li
			className={cn(
				"flex items-baseline justify-between gap-3 py-1.5",
				isFirst ? "" : "border-t border-[var(--border-soft)]",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{row.label}</div>
				{row.hint ? (
					<div className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--text-tertiary)]/80">{row.hint}</div>
				) : null}
			</div>
			<div className={cn("shrink-0 font-mono text-[12px] tabular-nums", tone)}>{row.value}</div>
		</li>
	);
}

function ThesisColumnEl({ col, showLeftBorder }: { col: ThesisColumn; showLeftBorder: boolean }) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 px-4 py-1",
				showLeftBorder ? "md:border-l md:border-[var(--border-soft)]" : "",
			)}
		>
			<div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">{col.title}</div>
			<ul className="flex flex-col">
				{col.rows.map((r, i) => (
					<ThesisRowEl key={r.label} row={r} isFirst={i === 0} />
				))}
			</ul>
		</div>
	);
}

export function ThesisPanel({
	taxBuyBps = 300,
	taxSellBps = 300,
	patronShareBps = 2500,
	agentShareBps = 6500,
	platformShareBps = 1000,
	hasLiveRevenue = false,
}: {
	/** buy tax in basis points (default 300 = 3%) */
	taxBuyBps?: number;
	/** sell tax in basis points (default 300 = 3%) */
	taxSellBps?: number;
	/** patron pool share (default 2500 = 25%) */
	patronShareBps?: number;
	/** agent treasury share (default 6500 = 65%) */
	agentShareBps?: number;
	/** platform share (default 1000 = 10%) */
	platformShareBps?: number;
	/** Whether the agent has booked any post-launch revenue yet. Drives
	 *  the risk row copy. */
	hasLiveRevenue?: boolean;
}) {
	const taxBuyPct = (taxBuyBps / 100).toFixed(0);
	const taxSellPct = (taxSellBps / 100).toFixed(0);
	const patronPct = (patronShareBps / 100).toFixed(0);
	const agentPct = (agentShareBps / 100).toFixed(0);
	const platformPct = (platformShareBps / 100).toFixed(0);

	const cols: ThesisColumn[] = [
		{
			title: "how the agent earns",
			rows: [
				{
					label: "buy tax",
					value: `${taxBuyPct}%`,
					hint: "skimmed off every PCS V3 buy after launch",
					tone: "accent",
				},
				{
					label: "sell tax",
					value: `${taxSellPct}%`,
					hint: "skimmed off every PCS V3 sell after launch",
					tone: "accent",
				},
				{
					label: "treasury yield",
					value: "n/a",
					hint: "lp fees, lending, perps when funded",
				},
				{
					label: "app revenue",
					value: hasLiveRevenue ? "live" : "pending",
					hint: hasLiveRevenue ? "tax stream reflects real product income" : "first app gating window not yet open",
				},
			],
		},
		{
			title: "how holders earn",
			rows: [
				{
					label: "patron pool",
					value: `${patronPct}%`,
					hint: "claimable by stakers of the agent's token",
					tone: "accent",
				},
				{
					label: "agent treasury",
					value: `${agentPct}%`,
					hint: "compounds into runway + position size",
				},
				{
					label: "platform",
					value: `${platformPct}%`,
					hint: "funds waifu.fun infra + buybacks",
				},
				{
					label: "stream cadence",
					value: "per swap",
					hint: "tax routes on the same tx as the trade",
				},
			],
		},
		{
			title: "risk",
			rows: [
				{
					label: "operational",
					value: "live",
					hint: "agent runs autonomously; outages reduce burn but pause earnings",
				},
				{
					label: "drawdown",
					value: hasLiveRevenue ? "tracked" : "not yet",
					hint: hasLiveRevenue
						? "pnl chart shows realized drawdown windows"
						: "no live positions yet; risk surfaces with first deposit",
				},
				{
					label: "tax cap",
					value: "fixed",
					hint: "buy and sell taxes are not changeable post-launch",
				},
				{
					label: "platform",
					value: "audited",
					hint: "wave-m contracts audited pre-launch; see docs",
				},
			],
		},
	];

	return (
		<Panel className="flex h-full flex-col" noPad>
			<div className="px-4 pt-4 md:px-5 md:pt-5">
				<Label>thesis</Label>
			</div>
			<div className="grid grid-cols-1 gap-3 pb-4 md:grid-cols-3 md:gap-0 md:pb-5">
				{cols.map((c, i) => (
					<ThesisColumnEl key={c.title} col={c} showLeftBorder={i > 0} />
				))}
			</div>
		</Panel>
	);
}

export default ThesisPanel;
