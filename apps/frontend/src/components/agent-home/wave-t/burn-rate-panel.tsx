/**
 * Monthly burn panel.
 *
 * Renders agent operating costs as a list of line items from the persona
 * endpoint (`agent.burn`). The total ($/mo) is computed from the items
 * when not supplied as `monthlyBurnUsd`. Empty array, missing items, or
 * missing total all suppress the panel (the parent gates render on
 * presence, this component never invents numbers).
 *
 * Runway is computed via the shared `computeRunway` selector so the
 * hero stat strip and this panel agree byte-for-byte.
 *
 * Generic. No identity logic. Brand-icon resolution via `iconKey` against
 * a small static registry; unknown keys fall back to a neutral dot.
 */

"use client";

import type * as React from "react";

import type { BurnLineItem } from "@/components/agent-home/types";
import { AnthropicIcon, GithubIcon, OpenaiIcon, StewardIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";
import { computeRunway, runwayColor } from "@/lib/wave-t/runway";

import { Label, Panel, Pulse } from "./_primitives";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

const ICON_REGISTRY: Record<string, IconComponent> = {
	anthropic: AnthropicIcon,
	openai: OpenaiIcon,
	steward: StewardIcon,
	waifu: WaifuIcon,
	x: XIcon,
	twitter: XIcon,
	github: GithubIcon,
};

function iconFor(key?: string): IconComponent | null {
	if (!key) return null;
	return ICON_REGISTRY[key.toLowerCase()] ?? null;
}

function formatUsd0(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "$0";
	return `$${Math.round(n).toLocaleString("en-US")}`;
}

function LineRow({ item, isFirst }: { item: BurnLineItem; isFirst: boolean }) {
	const Icon = iconFor(item.iconKey);
	return (
		<li className={cn("flex items-center gap-3 py-2.5", isFirst ? "" : "border-t border-[var(--border-soft)]")}>
			<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[var(--text-secondary)]">
				{Icon ? <Icon className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-[12px] text-[var(--text-primary)]">{item.name}</span>
				{item.label ? (
					<span className="block font-mono text-[10px] text-[var(--text-tertiary)]">{item.label}</span>
				) : null}
			</span>
			<span className="shrink-0 font-mono text-[12.5px] tabular-nums text-[var(--text-primary)]">
				{formatUsd0(item.usd)}
			</span>
		</li>
	);
}

export interface BurnRatePanelProps {
	lineItems: BurnLineItem[];
	monthlyUsd: number;
	treasuryUsd?: number | null;
	last30dRevenueUsd?: number | null;
}

export function BurnRatePanel({ lineItems, monthlyUsd, treasuryUsd, last30dRevenueUsd }: BurnRatePanelProps) {
	const runway = computeRunway(treasuryUsd, monthlyUsd);
	const hasRevenue = typeof last30dRevenueUsd === "number" && last30dRevenueUsd > 0;
	const netBurnUsd = hasRevenue ? Math.max(0, monthlyUsd - (last30dRevenueUsd ?? 0)) : null;

	return (
		<Panel>
			<Label
				right={
					<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						monthly cost
					</span>
				}
			>
				burn rate
			</Label>

			<ul className="flex flex-col">
				{lineItems.map((it, i) => (
					<LineRow key={`${it.name}-${i}`} item={it} isFirst={i === 0} />
				))}
				<li className="mt-1 flex items-center gap-3 border-t border-[var(--border-mid)] pt-3">
					<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
						<Pulse tone="accent" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block text-[12px] text-[var(--accent)]">total</span>
						<span className="block font-mono text-[10px] text-[var(--text-tertiary)]">monthly operating cost</span>
					</span>
					<span className="shrink-0 font-mono text-[14px] tabular-nums text-[var(--accent)]">
						~{formatUsd0(monthlyUsd)}/mo
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
						className="font-mono text-[13px] tabular-nums"
						style={{ color: runway.days === null ? "var(--text-secondary)" : runwayColor(runway.tone) }}
					>
						{runway.days === null ? "no treasury data" : `${runway.days.toLocaleString("en-US")} days`}
					</span>
					<span className="font-mono text-[10px] text-[var(--text-tertiary)]">treasury / {formatUsd0(monthlyUsd)}</span>
				</div>
			</div>
		</Panel>
	);
}

export default BurnRatePanel;
