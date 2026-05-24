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

import { useTranslation } from "@/contexts/locale-context";
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
}: {
	taxBuyBps?: number;
	taxSellBps?: number;
	patronShareBps?: number;
	agentShareBps?: number;
	platformShareBps?: number;
	hasLiveRevenue?: boolean;
}) {
	const { t } = useTranslation();
	const taxBuyPct = (taxBuyBps / 100).toFixed(0);
	const taxSellPct = (taxSellBps / 100).toFixed(0);
	const patronPct = (patronShareBps / 100).toFixed(0);
	const agentPct = (agentShareBps / 100).toFixed(0);
	const platformPct = (platformShareBps / 100).toFixed(0);

	const cols: Column[] = [
		{
			heading: t("agent.thesis.col1Heading"),
			prose: t("agent.thesis.col1Prose", { taxBuyPct }),
			rows: [
				{
					label: t("agent.thesis.col1AgentLabel"),
					value: `${agentPct}%`,
					hint: t("agent.thesis.col1AgentHint"),
					tone: "accent",
				},
				{
					label: t("agent.thesis.col1PatronLabel"),
					value: `${patronPct}%`,
					hint: t("agent.thesis.col1PatronHint"),
					tone: "accent",
				},
				{
					label: t("agent.thesis.col1PlatformLabel"),
					value: `${platformPct}%`,
					hint: t("agent.thesis.col1PlatformHint"),
				},
			],
		},
		{
			heading: t("agent.thesis.col2Heading"),
			prose: t("agent.thesis.col2Prose"),
			rows: [
				{
					label: t("agent.thesis.col2TradeLabel"),
					value: t("agent.thesis.col2TradeValue"),
					hint: t("agent.thesis.col2TradeHint"),
					tone: "accent",
				},
				{
					label: t("agent.thesis.col2ShipLabel"),
					value: t("agent.thesis.col2ShipValue"),
					hint: t("agent.thesis.col2ShipHint"),
					tone: "accent",
				},
				{
					label: t("agent.thesis.col2PostLabel"),
					value: t("agent.thesis.col2PostValue"),
					hint: t("agent.thesis.col2PostHint"),
				},
				{
					label: t("agent.thesis.col2AppLabel"),
					value: hasLiveRevenue ? t("agent.thesis.col2AppValueLive") : t("agent.thesis.col2AppValuePending"),
					hint: hasLiveRevenue ? t("agent.thesis.col2AppHintLive") : t("agent.thesis.col2AppHintPending"),
				},
			],
		},
		{
			heading: t("agent.thesis.col3Heading"),
			prose: t("agent.thesis.col3Prose"),
			rows: [
				{
					label: t("agent.thesis.col3OpLabel"),
					value: t("agent.thesis.col3OpValue"),
					hint: t("agent.thesis.col3OpHint"),
				},
				{
					label: t("agent.thesis.col3DrawLabel"),
					value: hasLiveRevenue ? t("agent.thesis.col3DrawValueTracked") : t("agent.thesis.col3DrawValuePending"),
					hint: hasLiveRevenue ? t("agent.thesis.col3DrawHintTracked") : t("agent.thesis.col3DrawHintPending"),
				},
				{
					label: t("agent.thesis.col3TaxLabel"),
					value: t("agent.thesis.col3TaxValue"),
					hint: t("agent.thesis.col3TaxHint", { buyPct: taxBuyPct, sellPct: taxSellPct }),
				},
				{
					label: t("agent.thesis.col3PlatformLabel"),
					value: t("agent.thesis.col3PlatformValue"),
					hint: t("agent.thesis.col3PlatformHint"),
				},
			],
		},
	];

	return (
		<Panel className="flex h-full flex-col" noPad>
			<div className="flex items-center justify-between px-5 pt-5 md:px-6 md:pt-6">
				<Label className="mb-0">{t("agent.thesis.label")}</Label>
				<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					{t("agent.thesis.byline")}
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
