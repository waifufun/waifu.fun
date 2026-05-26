/** Apps panels backed by the `/v2/agents/:address/apps` registry. */

"use client";

import type * as React from "react";

import { ArrowUpRight } from "lucide-react";

import { GithubIcon, StewardIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import type { App } from "@/lib/wave-t/apps";
import { formatCompactUsd } from "@/lib/wave-t/format";
import { Label, Panel, Pulse, SectionTitle } from "./_primitives";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

const APP_ICONS: Record<string, IconComponent> = {
	waifu: WaifuIcon,
	steward: StewardIcon,
	"waifu-terminal": WaifuIcon,
	terminal: WaifuIcon,
	"twitter-replies": XIcon,
	content: XIcon,
	"trading-perps": GithubIcon,
	predictions: GithubIcon,
};

/**
 * Read the optional metadata bag on an App row. Lets producers attach
 * `tagline` / `kind` / `featured` without bloating the typed App shape.
 * Unknown keys are ignored.
 */
function appMeta(app: App): { tagline?: string; kind?: string; featured?: boolean } {
	const m = app.metadata as Record<string, unknown> | null | undefined;
	if (!m || typeof m !== "object") return {};
	const out: { tagline?: string; kind?: string; featured?: boolean } = {};
	if (typeof m.tagline === "string") out.tagline = m.tagline;
	if (typeof m.kind === "string") out.kind = m.kind;
	if (m.featured === true) out.featured = true;
	return out;
}

// Resolve a real logo URL for an app when we have one bundled.
// Falls back to the brand-icons SVG component for everything else.
const APP_LOGO_URLS: Record<string, string> = {
	waifu: "/brand/icon/icon_256.png",
	steward: "https://eliza.steward.fi/favicon.svg",
};

function AppIcon({ app, className }: { app: App; className?: string }) {
	if (app.icon?.startsWith("http")) {
		return <img src={app.icon} alt="" className={cn("rounded-full object-cover", className)} />;
	}
	const logoUrl = APP_LOGO_URLS[app.appId];
	if (logoUrl) {
		return <img src={logoUrl} alt={app.name} className={cn("rounded-full object-cover", className)} />;
	}
	if (app.icon) return <img src={app.icon} alt="" className={cn("rounded-full object-cover", className)} />;
	const Icon = APP_ICONS[app.appId] ?? GithubIcon;
	return <Icon className={className} />;
}

function StatusBadge({ status }: { status: App["status"] }) {
	if (status === "live") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-300">
				<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
				live
			</span>
		);
	}
	if (status === "paused") {
		return (
			<span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-yellow-200">
				paused
			</span>
		);
	}
	return (
		<span className="rounded-full border border-[var(--border-mid)] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
			scheduled
		</span>
	);
}

function EmptyAppsState() {
	return (
		<li className="py-4 font-mono text-[11px] leading-relaxed text-[var(--text-tertiary)]">
			no apps yet · onchain feed quiet
		</li>
	);
}

function formatAppDate(app: App): string {
	const raw = app.shippedAt ?? app.createdAt;
	if (!raw) return "—";
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function AppsShipped({ apps, visibleCount = 4 }: { apps: App[]; visibleCount?: number }) {
	const live = apps.filter((a) => a.status === "live");
	// Featured apps (e.g. platform products) sort to the top so they own
	// the panel's first impression. Within each group, render order is
	// preserved from the backend so the producer keeps control.
	const sorted = [...apps].sort((a, b) => Number(appMeta(b).featured) - Number(appMeta(a).featured));
	const visible = sorted.slice(0, visibleCount);
	const remaining = Math.max(0, sorted.length - visible.length);

	return (
		<Panel>
			<Label>apps shipped</Label>
			<div className="flex items-baseline gap-2">
				<span className="font-sans text-[40px] font-light leading-none text-[var(--accent)] tabular-nums">
					{live.length}
				</span>
				<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					total live
				</span>
			</div>
			<ul className="mt-4 divide-y divide-[var(--border-soft)]">
				{visible.length === 0 ? (
					<EmptyAppsState />
				) : (
					visible.map((app) => {
						const meta = appMeta(app);
						const hasUrl = Boolean(app.appUrl);
						const tagline = meta.tagline ?? app.description ?? null;
						const isExternal = hasUrl && app.appUrl!.startsWith("http");
						const RowTag: "a" | "li" = hasUrl ? "a" : "li";
						const rowProps = hasUrl
							? {
									href: app.appUrl!,
									target: isExternal ? "_blank" : undefined,
									rel: isExternal ? "noopener noreferrer" : undefined,
								}
							: {};
						return (
							<li key={app.appId}>
								<RowTag
									{...(rowProps as Record<string, unknown>)}
									className={cn(
										"group flex items-center gap-3 py-2",
										hasUrl && "transition-colors hover:bg-white/[0.015]",
									)}
								>
									<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
										<AppIcon app={app} className="h-3.5 w-3.5" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-2">
											<span className="truncate text-[12px] text-[var(--text-primary)]">{app.name}</span>
											{meta.featured && app.status === "live" ? <Pulse tone="accent" /> : null}
										</span>
										<span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
											{tagline ?? `${app.shippedAt ? "shipped" : "first seen"} ${formatAppDate(app)}`}
										</span>
									</span>
									{hasUrl ? (
										<span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]">
											view
											<ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
										</span>
									) : (
										<StatusBadge status={app.status} />
									)}
								</RowTag>
							</li>
						);
					})
				)}
			</ul>
			{remaining > 0 && (
				<a
					href="#apps"
					className={cn(
						"mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3",
						"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]",
					)}
				>
					<span>more apps</span>
					<span className="font-mono tabular-nums">{remaining}</span>
				</a>
			)}
		</Panel>
	);
}

function TopAppsList({ apps, limit }: { apps: App[]; limit: number }) {
	const ranked = [...apps].sort((a, b) => b.revenue7dUsd - a.revenue7dUsd).slice(0, limit);
	return (
		<ol className="divide-y divide-[var(--border-soft)]">
			{ranked.length === 0 ? (
				<EmptyAppsState />
			) : (
				ranked.map((app, idx) => {
					const delta = app.revenue7dDeltaPct;
					const scheduled = app.status === "scheduled";
					const positive = delta !== null && delta > 0;
					const negative = delta !== null && delta < 0;
					return (
						<li key={app.appId} className="grid grid-cols-[18px_28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
							<span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
								{String(idx + 1).padStart(2, "0")}
							</span>
							<span
								className={cn(
									"inline-flex h-7 w-7 items-center justify-center rounded-full",
									scheduled
										? "bg-white/[0.03] text-[var(--text-tertiary)]"
										: "bg-[var(--accent-soft)] text-[var(--accent)]",
								)}
							>
								<AppIcon app={app} className="h-3.5 w-3.5" />
							</span>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<span className="truncate text-[12px] text-[var(--text-primary)]">{app.name}</span>
									<StatusBadge status={app.status} />
								</div>
								<div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--text-secondary)]">
									{app.description ?? `${app.shippedAt ? "shipped" : "first seen"} ${formatAppDate(app)}`}
								</div>
							</div>
							<div className="flex shrink-0 flex-col items-end font-mono tabular-nums">
								{scheduled ? (
									<span className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">scheduled</span>
								) : (
									<>
										<span className="text-[12px] text-[var(--text-primary)]">{formatCompactUsd(app.revenue7dUsd)}</span>
										<span className="text-[10px] text-[var(--text-tertiary)]">
											24h {formatCompactUsd(app.revenue24hUsd)}
										</span>
										{delta !== null && (
											<span
												className={cn(
													"text-[10px]",
													positive && "text-[var(--positive)]",
													negative && "text-[var(--negative)]",
													!positive && !negative && "text-[var(--text-tertiary)]",
												)}
											>
												{positive ? "+" : ""}
												{delta.toFixed(1)}% vs prev 7d
											</span>
										)}
									</>
								)}
							</div>
						</li>
					);
				})
			)}
		</ol>
	);
}

export function TopAppsByRevenue({ apps, limit = 4 }: { apps: App[]; limit?: number }) {
	return (
		<Panel>
			<Label
				right={
					<a
						href="#apps"
						className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
					>
						View all
					</a>
				}
			>
				Top Apps by Revenue (7D)
			</Label>
			<TopAppsList apps={apps} limit={limit} />
		</Panel>
	);
}

type Props = {
	apps: App[];
	totalRevenue7d: number;
	totalLifetime: number;
	feesGenerated30d?: number;
	feesChange30d?: number;
};

function StatBlock({
	label,
	value,
	change,
	pendingNote,
}: { label: string; value: number; change: number; pendingNote?: string }) {
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
						{change.toFixed(1)}% vs prev 7D
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

export function AppsRevenue({ apps, totalRevenue7d, totalLifetime, feesGenerated30d = 0, feesChange30d = 0 }: Props) {
	return (
		<Panel>
			<Label>Apps & Revenue</Label>
			<div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<div className="flex flex-col gap-5 md:border-r md:border-[var(--border-soft)] md:pr-6">
					<StatBlock
						label="Total Revenue (7D)"
						value={totalRevenue7d}
						change={0}
						pendingNote="instrumentation pending"
					/>
					<StatBlock
						label="Lifetime Revenue"
						value={totalLifetime}
						change={0}
						pendingNote="steward billing wires soon"
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
						<a href="#apps" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							View all
						</a>
					</div>
					<TopAppsList apps={apps} limit={4} />
				</div>
			</div>
		</Panel>
	);
}
