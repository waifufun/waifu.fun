/**
 * Worker C - Apps & Revenue split panel.
 *
 * Left column: total revenue + fees generated stats (honest $0 today).
 * Right column: top apps table with horizontal progress bars showing
 * each app's share of total revenue. Structure is wired so the moment
 * Steward billing exposes per-agent revenue the bars light up.
 */

"use client";

import type * as React from "react";

import { StewardIcon, WaifuIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import type { App } from "../lib/apps";
import { formatCompactUsd } from "../lib/format";
import { Label, Panel, SectionTitle } from "./_primitives";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

const APP_ICONS: Record<string, IconComponent> = {
	waifu: WaifuIcon,
	steward: StewardIcon,
};

type Props = {
	apps: App[];
	totalRevenue30d: number;
	totalChange30d: number;
	feesGenerated30d?: number;
	feesChange30d?: number;
};

function StatBlock({
	label,
	value,
	change,
	pendingNote,
}: {
	label: string;
	value: number;
	change: number;
	pendingNote?: string;
}) {
	const positive = change > 0;
	const negative = change < 0;
	const isEmpty = value <= 0;

	return (
		<div className="flex flex-col gap-1.5">
			<SectionTitle>{label}</SectionTitle>
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-[26px] text-[var(--text-primary)] tabular-nums">{formatCompactUsd(value)}</span>
				{!isEmpty && (
					<span
						className={cn(
							"font-mono text-[11px] tabular-nums",
							positive && "text-[var(--positive)]",
							negative && "text-[var(--negative)]",
							!positive && !negative && "text-[var(--text-tertiary)]",
						)}
					>
						{positive ? "+" : ""}
						{change.toFixed(1)}% vs prev 30D
					</span>
				)}
			</div>
			{isEmpty && pendingNote && (
				<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
					{pendingNote}
				</span>
			)}
		</div>
	);
}

function AppRow({ app, share }: { app: App; share: number }) {
	const Icon = APP_ICONS[app.id];
	const pct = Math.max(0, Math.min(100, share * 100));
	const pending = app.revenue30d <= 0;

	return (
		<div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 py-2">
			<span
				className={cn(
					"inline-flex h-5 w-5 items-center justify-center rounded",
					"bg-[var(--accent-soft)] text-[var(--accent)]",
				)}
			>
				{Icon ? <Icon className="h-3 w-3" /> : null}
			</span>
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span className="truncate font-mono text-[12px] text-[var(--text-primary)]">{app.name}</span>
					{app.status === "scheduled" && (
						<span className="rounded-sm border border-[var(--border-mid)] bg-white/[0.02] px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							scheduled
						</span>
					)}
				</div>
				<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.04]" aria-hidden>
					<div
						className="h-full rounded-full transition-[width] duration-700 ease-out"
						style={{
							width: `${pct}%`,
							background: pending
								? "rgba(255,255,255,0.06)"
								: "linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%)",
						}}
					/>
				</div>
			</div>
			<div className="flex shrink-0 flex-col items-end font-mono text-[11px] tabular-nums">
				<span className="text-[var(--text-primary)]">{formatCompactUsd(app.revenue30d)}</span>
				<span className="text-[var(--text-tertiary)]">{pct.toFixed(1)}%</span>
			</div>
		</div>
	);
}

export function AppsRevenue({ apps, totalRevenue30d, totalChange30d, feesGenerated30d = 0, feesChange30d = 0 }: Props) {
	const denom = totalRevenue30d || apps.length || 1;
	const rows = apps.map((a) => ({
		app: a,
		share: totalRevenue30d > 0 ? a.revenue30d / denom : 0,
	}));

	return (
		<Panel>
			<Label>Apps & Revenue</Label>
			<div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				{/* left: stats */}
				<div className="flex flex-col gap-5 md:border-r md:border-[var(--border-soft)] md:pr-6">
					<StatBlock
						label="Total Revenue (30D)"
						value={totalRevenue30d}
						change={totalChange30d}
						pendingNote="instrumentation pending"
					/>
					<StatBlock
						label="Fees Generated (30D)"
						value={feesGenerated30d}
						change={feesChange30d}
						pendingNote="steward billing wires soon"
					/>
				</div>

				{/* right: top apps */}
				<div className="flex flex-col">
					<div className="mb-1 flex items-center justify-between">
						<SectionTitle>Top Apps</SectionTitle>
						<div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							<span>Revenue (30D)</span>
							<span className="w-10 text-right">%</span>
						</div>
					</div>
					<div className="divide-y divide-[var(--border-soft)]">
						{rows.length === 0 ? (
							<div className="py-6 text-center font-mono text-[11px] text-[var(--text-tertiary)]">
								no apps shipped yet
							</div>
						) : (
							rows.map(({ app, share }) => <AppRow key={app.id} app={app} share={share} />)
						)}
					</div>
				</div>
			</div>
		</Panel>
	);
}
