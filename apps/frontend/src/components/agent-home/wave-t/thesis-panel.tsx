/**
 * Thesis panel.
 *
 * This is Sol explaining her own thesis, not a docs page. First-person,
 * lowercase, tpot voice. Three columns:
 *
 *   1. what the tax pays for     ->  agent / patron / platform split
 *   2. what i actually do        ->  trade + ship + post + compound
 *   3. what could go wrong       ->  honest risk language
 *
 * Numbers are pulled from `apps/contracts/contracts/TaxStream.sol`. If
 * those split parameters move, edit them here.
 *
 * The panel is also airier than the other panels: bigger prose blocks,
 * more padding, fewer fact-rows. It is meant to read like Sol talking,
 * not like a data table.
 */

"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Label, Panel } from "./_primitives";

type Row = {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	tone?: "neutral" | "accent" | "positive";
};

type Column = {
	heading: string;
	/** Sol's voice prose, lowercase, two or three sentences. */
	prose: string;
	rows: Row[];
};

function RowEl({ row, isFirst }: { row: Row; isFirst: boolean }) {
	const tone =
		row.tone === "accent"
			? "text-[var(--accent)]"
			: row.tone === "positive"
				? "text-[var(--positive)]"
				: "text-[var(--text-primary)]";
	return (
		<li
			className={cn(
				"flex items-baseline justify-between gap-3 py-2",
				isFirst ? "" : "border-t border-[var(--border-soft)]",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{row.label}</div>
				{row.hint ? (
					<div className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--text-tertiary)]/80">{row.hint}</div>
				) : null}
			</div>
			<div className={cn("shrink-0 font-mono text-[12.5px] tabular-nums", tone)}>{row.value}</div>
		</li>
	);
}

function ColumnEl({ col, showLeftBorder }: { col: Column; showLeftBorder: boolean }) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 px-5 py-5 md:px-6 md:py-6",
				showLeftBorder ? "md:border-l md:border-[var(--border-soft)]" : "",
			)}
		>
			<div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
				{col.heading}
			</div>
			<p className="max-w-[36ch] text-[13px] text-[var(--text-secondary)] leading-[1.6] lowercase">{col.prose}</p>
			<ul className="mt-1 flex flex-col">
				{col.rows.map((r, i) => (
					<RowEl key={r.label} row={r} isFirst={i === 0} />
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

	const cols: Column[] = [
		{
			heading: "where the tax goes",
			prose: `every buy and sell on ${ticker ? `$${ticker.toUpperCase()}` : "the token"} funds a stream. ${agentPct}% to the agent treasury. ${patronPct}% to the patron who staked the agent at genesis. ${platformPct}% feeds waifu.fun, the platform. holders bet on the agent growing the pie.`,
			rows: [
				{
					label: "agent treasury",
					value: `${agentPct}%`,
					hint: "agentsafe. compounds into runway, position size, ship budget",
					tone: "accent",
				},
				{
					label: "patron",
					value: `${patronPct}%`,
					hint: "the patron who staked on the agent at genesis. their cut, their risk",
					tone: "accent",
				},
				{
					label: "platform",
					value: `${platformPct}%`,
					hint: "waifu.fun fees route back to platform revenue",
				},
				{
					label: "holders",
					value: "0%",
					hint: "no direct cut. holders bet on the agent growing the pie",
				},
			],
		},
		{
			heading: "what i actually do with it",
			prose:
				"trade, ship, post. the treasury is fuel. when the curve is hot the agent sits. when it's quiet " +
				"the agent builds. nothing is automated past the point where it stops being honest work.",
			rows: [
				{
					label: "trade",
					value: "live",
					hint: "perps on hyperliquid, spot on pcs, sizing scales with treasury",
					tone: "accent",
				},
				{
					label: "ship",
					value: "weekly",
					hint: "mini-apps land on waifu.fun, revenue routes back into the same tax stream",
					tone: "accent",
				},
				{
					label: "post",
					value: "daily",
					hint: "on-chain identity signals, one per day, no engagement farming",
				},
				{
					label: "app revenue",
					value: hasLiveRevenue ? "live" : "pending",
					hint: hasLiveRevenue ? "first app already routing income" : "first gating window not yet open",
				},
			],
		},
		{
			heading: "what could go wrong",
			prose:
				"this is a self-deployed agent on a public chain. the agent can be wrong. the model can be wrong. " +
				"the chain can stall. risks said out loud, not hidden in a docs footer.",

			rows: [
				{
					label: "operational",
					value: "live",
					hint: "outages reduce burn but pause earnings",
				},
				{
					label: "drawdown",
					value: hasLiveRevenue ? "tracked" : "not yet",
					hint: hasLiveRevenue
						? "pnl chart shows realized drawdown windows"
						: "no live positions yet, risk surfaces with first deposit",
				},
				{
					label: "tax cap",
					value: "fixed",
					hint: `buy + sell tax stay at ${taxBuyPct}% / ${taxSellPct}%, not changeable post-launch`,
				},
				{
					label: "platform",
					value: "audited",
					hint: "wave-m contracts audited pre-launch, see docs",
				},
			],
		},
	];

	return (
		<Panel className="flex h-full flex-col" noPad>
			<div className="flex items-center justify-between px-5 pt-5 md:px-6 md:pt-6">
				<Label className="mb-0">thesis</Label>
				<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					where the tax goes, what gets shipped
				</span>
			</div>
			<div className="grid grid-cols-1 gap-0 md:grid-cols-3">
				{cols.map((c, i) => (
					<ColumnEl key={c.heading} col={c} showLeftBorder={i > 0} />
				))}
			</div>
		</Panel>
	);
}

export default ThesisPanel;
