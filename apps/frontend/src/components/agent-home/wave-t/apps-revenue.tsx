/**
 * Worker C - Apps panels (v2).
 *
 * Exports two distinct panels that match the v2 mockup:
 *
 *   <AppsShipped>          - small "X Total Live" stat block + short
 *                            list of currently-live apps with mini
 *                            icons and a "More apps" footer.
 *
 *   <TopAppsByRevenue>     - numbered ranking list (1..N) with mini
 *                            avatars, name + sub-text, revenue $ and
 *                            green % delta. "View all" link top-right.
 *
 *   <AppsRevenue>          - legacy combined panel kept for back
 *                            compatibility with the orchestrator
 *                            until it migrates to the split layout.
 *
 * All numbers come from props. The Sol apps list lives in lib/apps.ts
 * (foundation-owned) and is honest about $0 revenue today.
 */

"use client";

import type * as React from "react";

import { GithubIcon, StewardIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import type { App } from "@/lib/wave-t/apps";
import { formatCompactUsd } from "@/lib/wave-t/format";
import { Label, Panel, SectionTitle } from "./_primitives";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

// Visual mapping app-id -> icon. New ids fall back to a generic glyph.
const APP_ICONS: Record<string, IconComponent> = {
	waifu: WaifuIcon,
	steward: StewardIcon,
	"waifu-terminal": WaifuIcon,
	terminal: WaifuIcon,
	"alpha-signals": XIcon,
	"sol-sniper": GithubIcon,
	"trend-oracle": GithubIcon,
};

function AppIcon({ id, className }: { id: string; className?: string }) {
	const Icon = APP_ICONS[id] ?? GithubIcon;
	return <Icon className={className} />;
}

// ── <AppsShipped> ────────────────────────────────────────────────

export function AppsShipped({
	apps,
	visibleCount = 3,
}: {
	apps: App[];
	visibleCount?: number;
}) {
	const live = apps.filter((a) => a.status === "live");
	const visible = live.slice(0, visibleCount);
	const remaining = Math.max(0, apps.length - visible.length);

	return (
		<Panel>
			<Label>Apps Shipped</Label>

			<div className="flex items-baseline gap-2">
				<span className="font-sans text-[40px] font-light leading-none text-[var(--accent)] tabular-nums">
					{live.length}
				</span>
				<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					Total Live
				</span>
			</div>

			<ul className="mt-4 divide-y divide-[var(--border-soft)]">
				{visible.length === 0 ? (
					<li className="py-2 font-mono text-[11px] text-[var(--text-tertiary)]">no live apps yet</li>
				) : (
					visible.map((app) => (
						<li key={app.id} className="flex items-center gap-3 py-2">
							<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
								<AppIcon id={app.id} className="h-3 w-3" />
							</span>
							<span className="flex-1 truncate text-[12px] text-[var(--text-primary)]">{app.name}</span>
							<span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
								{formatCompactUsd(app.revenue30d)}
							</span>
						</li>
					))
				)}
			</ul>

			{remaining > 0 && (
				<a
					href="#apps"
					className={cn(
						"mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3",
						"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
						"transition-colors hover:text-[var(--accent)]",
					)}
				>
					<span>More apps</span>
					<span className="font-mono tabular-nums">{remaining}</span>
				</a>
			)}
		</Panel>
	);
}

// ── <TopAppsList> (Panel-free, composable) ───────────────────────

function TopAppsList({ apps, limit }: { apps: App[]; limit: number }) {
	const ranked = [...apps].sort((a, b) => b.revenue30d - a.revenue30d).slice(0, limit);
	return (
		<ol className="divide-y divide-[var(--border-soft)]">
			{ranked.length === 0 ? (
				<li className="py-4 text-center font-mono text-[11px] text-[var(--text-tertiary)]">no apps shipped yet</li>
			) : (
				ranked.map((app, idx) => {
					const positive = app.change30d > 0;
					const negative = app.change30d < 0;
					const pending = app.revenue30d <= 0;
					return (
						<li key={app.id} className="grid grid-cols-[18px_28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
							<span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
								{String(idx + 1).padStart(2, "0")}
							</span>
							<span
								className={cn(
									"inline-flex h-7 w-7 items-center justify-center rounded-full",
									pending
										? "bg-white/[0.03] text-[var(--text-tertiary)]"
										: "bg-[var(--accent-soft)] text-[var(--accent)]",
								)}
							>
								<AppIcon id={app.id} className="h-3.5 w-3.5" />
							</span>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="truncate text-[12px] text-[var(--text-primary)]">{app.name}</span>
									{app.status === "scheduled" && (
										<span className="rounded-sm border border-[var(--border-mid)] bg-white/[0.02] px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
											scheduled
										</span>
									)}
								</div>
								<div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--text-secondary)]">
									{app.description}
								</div>
							</div>
							<div className="flex shrink-0 flex-col items-end font-mono tabular-nums">
								<span className="text-[12px] text-[var(--text-primary)]">{formatCompactUsd(app.revenue30d)}</span>
								{!pending && (
									<span
										className={cn(
											"text-[10px]",
											positive && "text-[var(--positive)]",
											negative && "text-[var(--negative)]",
											!positive && !negative && "text-[var(--text-tertiary)]",
										)}
									>
										{positive ? "+" : ""}
										{app.change30d.toFixed(1)}%
									</span>
								)}
								{pending && <span className="text-[10px] text-[var(--text-tertiary)]">pending</span>}
							</div>
						</li>
					);
				})
			)}
		</ol>
	);
}

// ── <TopAppsByRevenue> (panel wrapper) ───────────────────────────

export function TopAppsByRevenue({ apps, limit = 4 }: { apps: App[]; limit?: number }) {
	return (
		<Panel>
			<Label
				right={
					<a
						href="#apps"
						className={cn(
							"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
							"transition-colors hover:text-[var(--accent)]",
						)}
					>
						View all
					</a>
				}
			>
				Top Apps by Revenue (30D)
			</Label>
			<TopAppsList apps={apps} limit={limit} />
		</Panel>
	);
}

// ── <AppsRevenue> (legacy combined) ──────────────────────────────

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
				<span className="font-sans text-[26px] font-light leading-none text-[var(--text-primary)] tabular-nums">
					{formatCompactUsd(value)}
				</span>
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

export function AppsRevenue({ apps, totalRevenue30d, totalChange30d, feesGenerated30d = 0, feesChange30d = 0 }: Props) {
	return (
		<Panel>
			<Label>Apps & Revenue</Label>
			<div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
				<div className="flex flex-col">
					<div className="mb-1 flex items-center justify-between">
						<SectionTitle>Top Apps</SectionTitle>
						<a
							href="#apps"
							className={cn(
								"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
								"transition-colors hover:text-[var(--accent)]",
							)}
						>
							View all
						</a>
					</div>
					<TopAppsList apps={apps} limit={4} />
				</div>
			</div>
		</Panel>
	);
}
