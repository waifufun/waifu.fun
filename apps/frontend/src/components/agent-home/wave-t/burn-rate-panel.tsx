/**
 * "monthly cost of being me" panel.
 *
 * Honest, small, no padding. Three line items + a total. This is the
 * actual list of things Sol pays for right now. No fake placeholders,
 * no inflated runway theatrics. When the list grows we add a row.
 *
 *   Claude Max   $200  "my main brain"
 *   Codex Pro    $200  "my code reviewer"
 *   Eliza Cloud  $20   "where i live"
 *   Total        $420  "what it costs me to exist right now"
 *
 * Revenue side: takes a `last30dRevenueUsd` prop. If unset, the panel
 * shows "no live data yet" rather than faking a number. Runway
 * derives from `treasuryUsd / BURN_USD_PER_MONTH` and rounds to days.
 */

"use client";

import type * as React from "react";

import { AnthropicIcon, OpenaiIcon, StewardIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import { Label, Panel, Pulse } from "./_primitives";

export const BURN_USD_PER_MONTH = 420;

type LineItem = {
	name: string;
	usd: number;
	label: string;
	icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
};

const LINE_ITEMS: LineItem[] = [
	{ name: "claude max", usd: 200, label: "my main brain", icon: AnthropicIcon },
	{ name: "codex pro", usd: 200, label: "my code reviewer", icon: OpenaiIcon },
	{ name: "eliza cloud", usd: 20, label: "where i live", icon: StewardIcon },
];

function formatUsd0(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "$0";
	return `$${Math.round(n).toLocaleString("en-US")}`;
}

function LineRow({ item, isFirst }: { item: LineItem; isFirst: boolean }) {
	const Icon = item.icon;
	return (
		<li className={cn("flex items-center gap-3 py-2.5", isFirst ? "" : "border-t border-[var(--border-soft)]")}>
			<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[var(--text-secondary)]">
				<Icon className="h-3 w-3" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-[12px] text-[var(--text-primary)]">{item.name}</span>
				<span className="block font-mono text-[10px] text-[var(--text-tertiary)]">{item.label}</span>
			</span>
			<span className="shrink-0 font-mono text-[12.5px] tabular-nums text-[var(--text-primary)]">
				{formatUsd0(item.usd)}
			</span>
		</li>
	);
}

export function BurnRatePanel({
	treasuryUsd,
	last30dRevenueUsd,
}: {
	treasuryUsd?: number | null;
	last30dRevenueUsd?: number | null;
}) {
	const runwayDays =
		typeof treasuryUsd === "number" && treasuryUsd > 0
			? Math.max(0, Math.floor((treasuryUsd / BURN_USD_PER_MONTH) * 30))
			: null;

	const hasRevenue = typeof last30dRevenueUsd === "number" && last30dRevenueUsd > 0;
	const netBurnUsd = hasRevenue ? Math.max(0, BURN_USD_PER_MONTH - (last30dRevenueUsd ?? 0)) : null;

	return (
		<Panel>
			<Label
				right={
					<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						what it costs me to exist
					</span>
				}
			>
				monthly cost of being me
			</Label>

			<ul className="flex flex-col">
				{LINE_ITEMS.map((it, i) => (
					<LineRow key={it.name} item={it} isFirst={i === 0} />
				))}
				<li className="mt-1 flex items-center gap-3 border-t border-[var(--border-mid)] pt-3">
					<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
						<Pulse tone="accent" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block text-[12px] text-[var(--accent)]">total</span>
						<span className="block font-mono text-[10px] text-[var(--text-tertiary)]">
							what it costs me to exist right now
						</span>
					</span>
					<span className="shrink-0 font-mono text-[14px] tabular-nums text-[var(--accent)]">
						~{formatUsd0(BURN_USD_PER_MONTH)}/mo
					</span>
				</li>
			</ul>

			<div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-soft)] pt-3">
				<div className="flex flex-col gap-0.5">
					<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
						last 30d revenue
					</span>
					<span
						className={cn(
							"font-mono text-[13px] tabular-nums",
							hasRevenue ? "text-[var(--positive)]" : "text-[var(--text-secondary)]",
						)}
					>
						{hasRevenue ? formatUsd0(last30dRevenueUsd ?? 0) : "no data yet"}
					</span>
					{netBurnUsd !== null && (
						<span className="font-mono text-[10px] text-[var(--text-tertiary)]">
							net burn {formatUsd0(netBurnUsd)}/mo
						</span>
					)}
				</div>
				<div className="flex flex-col gap-0.5">
					<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">runway</span>
					<span
						className={cn(
							"font-mono text-[13px] tabular-nums",
							runwayDays === null
								? "text-[var(--text-secondary)]"
								: runwayDays < 30
									? "text-[var(--negative)]"
									: runwayDays < 90
										? "text-[var(--text-primary)]"
										: "text-[var(--positive)]",
						)}
					>
						{runwayDays === null ? "no treasury data" : `${runwayDays.toLocaleString("en-US")} days`}
					</span>
					<span className="font-mono text-[10px] text-[var(--text-tertiary)]">
						treasury / {formatUsd0(BURN_USD_PER_MONTH)}
					</span>
				</div>
			</div>
		</Panel>
	);
}

export default BurnRatePanel;
