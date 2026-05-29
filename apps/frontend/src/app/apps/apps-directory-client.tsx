/**
 * Apps directory. The discovery surface for "agents do work you can pay for".
 *
 * Dense, live, tpot per .impeccable.md. Composes only wave-t primitives.
 * Data-driven: rows come from the apps registry aggregator. No fixtures.
 * Empty registry renders the honest wave-t empty state.
 */

"use client";

import Link from "next/link";
import * as React from "react";

import {
	Hairline,
	Label,
	MicroStat,
	Panel,
	Pulse,
	SectionTitle,
	StatPill,
	THEME_TOKENS,
} from "@/components/agent-home/wave-t/_primitives";
import { cn } from "@/lib/utils";
import type { AppStatus } from "@/lib/wave-t/apps";
import { type AppsDirectory, type DirectoryApp, appMeta, appPricePerUseUsd } from "@/lib/wave-t/apps-directory-types";
import { formatCompactUsd } from "@/lib/wave-t/format";

type Filter = "all" | "live" | "paused";

// ── small helpers ────────────────────────────────────────────────

function relativeTime(iso: string | null): string | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return null;
	const diff = Date.now() - t;
	if (diff < 0) return "soon";
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

function priceLabel(app: DirectoryApp): string {
	const p = appPricePerUseUsd(app);
	if (p === null) return "free";
	if (p < 0.01) return `$${p.toFixed(4)}/use`;
	if (p < 1) return `$${p.toFixed(2)}/use`;
	return `$${p.toFixed(2)}/use`;
}

function AppGlyph({ app, size = 28 }: { app: DirectoryApp; size?: number }) {
	const [failed, setFailed] = React.useState(false);
	const src = app.icon?.startsWith("http") ? app.icon : null;
	const dim = { width: size, height: size };
	if (src && !failed) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img alt="" src={src} onError={() => setFailed(true)} className="shrink-0 rounded-md object-cover" style={dim} />
		);
	}
	// honest fallback: monogram tile, accent-tinted for live apps.
	const live = app.status === "live";
	return (
		<span
			aria-hidden
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-md font-mono uppercase",
				live ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-white/[0.03] text-[var(--text-tertiary)]",
			)}
			style={{ ...dim, fontSize: Math.round(size * 0.42), boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}
		>
			{(app.name || app.appId || "?").slice(0, 1)}
		</span>
	);
}

function StatusTag({ status }: { status: AppStatus }) {
	if (status === "live") {
		return (
			<StatPill tone="accent">
				<Pulse tone="accent" />
				live
			</StatPill>
		);
	}
	if (status === "paused") {
		return <StatPill tone="neutral">paused</StatPill>;
	}
	return <StatPill tone="neutral">scheduled</StatPill>;
}

// ── app card ─────────────────────────────────────────────────────

function AppCard({ app }: { app: DirectoryApp }) {
	const meta = appMeta(app);
	const tagline = meta.tagline ?? app.description ?? null;
	const appUrl = app.appUrl;
	const hasUrl = Boolean(appUrl);
	const isExternal = Boolean(appUrl?.startsWith("http"));
	const shipped = relativeTime(app.shippedAt ?? app.createdAt);
	const delta = app.revenue7dDeltaPct;
	const positive = delta !== null && delta > 0;
	const negative = delta !== null && delta < 0;

	return (
		<Panel className="flex flex-col">
			{/* head: glyph + name + agent, status to the right */}
			<div className="flex items-start gap-3">
				<AppGlyph app={app} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate text-[13px] text-[var(--text-primary)]">{app.name}</span>
						{meta.featured ? <Pulse tone="accent" /> : null}
					</div>
					<Link
						href={`/agent/${app.agent.address}`}
						className="mt-0.5 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[10px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
					>
						<span className="truncate">by {app.agent.name}</span>
						{app.agent.ticker ? (
							<span className="shrink-0 uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
								{app.agent.ticker}
							</span>
						) : null}
					</Link>
				</div>
				<StatusTag status={app.status} />
			</div>

			{/* description */}
			<p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
				{tagline ?? (shipped ? `first seen ${shipped}` : "no description yet")}
			</p>

			<Hairline className="my-3" />

			{/* revenue + price row */}
			<div className="grid grid-cols-3 gap-3">
				<MicroStat
					label="rev 7d"
					value={app.revenue7dUsd > 0 ? formatCompactUsd(app.revenue7dUsd) : "$0"}
					tone={app.revenue7dUsd > 0 ? "accent" : "neutral"}
				/>
				<MicroStat
					label="lifetime"
					value={app.revenueLifetimeUsd > 0 ? formatCompactUsd(app.revenueLifetimeUsd) : "$0"}
				/>
				<MicroStat label="price" value={priceLabel(app)} />
			</div>

			{delta !== null ? (
				<div className="mt-2 font-mono text-[10px] tabular-nums">
					<span
						className={cn(
							positive && "text-[var(--positive)]",
							negative && "text-[var(--negative)]",
							!positive && !negative && "text-[var(--text-tertiary)]",
						)}
					>
						{positive ? "+" : ""}
						{delta.toFixed(1)}% vs prev 7d
					</span>
				</div>
			) : null}

			{/* launch affordance, pinned to the card bottom so rows stay even */}
			<div className="mt-auto flex items-center justify-between border-t border-[var(--border-soft)] pt-3">
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{shipped ? `shipped ${shipped}` : "registry entry"}
				</span>
				{hasUrl && appUrl ? (
					<a
						href={appUrl}
						target={isExternal ? "_blank" : undefined}
						rel={isExternal ? "noopener noreferrer" : undefined}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
							app.status === "live"
								? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]/60"
								: "border-[var(--border-mid)] bg-white/[0.02] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]",
						)}
					>
						use
						<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden role="img">
							<title>open</title>
							<path
								d="M3 9L9 3M9 3H4.5M9 3V7.5"
								stroke="currentColor"
								strokeWidth="1.4"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</a>
				) : (
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						no entry yet
					</span>
				)}
			</div>
		</Panel>
	);
}

// ── summary strip ────────────────────────────────────────────────

function SummaryStrip({ directory }: { directory: AppsDirectory }) {
	const { apps, liveCount, totalRevenue7d, totalLifetime, agentsScanned } = directory;
	return (
		<Panel>
			<Label
				right={
					apps.length > 0 ? (
						<span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							<Pulse tone="accent" />
							registry live
						</span>
					) : (
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							waiting on indexer
						</span>
					)
				}
			>
				directory
			</Label>
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div className="flex flex-col gap-1">
					<SectionTitle>apps live</SectionTitle>
					<span className="font-sans text-[30px] font-light leading-none text-[var(--accent)] tabular-nums">
						{liveCount}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<SectionTitle>registered</SectionTitle>
					<span className="font-sans text-[30px] font-light leading-none text-[var(--text-primary)] tabular-nums">
						{apps.length}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<SectionTitle>rev 7d</SectionTitle>
					<span className="font-sans text-[30px] font-light leading-none text-[var(--text-primary)] tabular-nums">
						{formatCompactUsd(totalRevenue7d)}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<SectionTitle>lifetime</SectionTitle>
					<span className="font-sans text-[30px] font-light leading-none text-[var(--text-primary)] tabular-nums">
						{formatCompactUsd(totalLifetime)}
					</span>
				</div>
			</div>
			<Hairline className="my-3" />
			<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				{agentsScanned > 0
					? `scanned ${agentsScanned} agent ${agentsScanned === 1 ? "registry" : "registries"}`
					: "no agents online"}
			</p>
		</Panel>
	);
}

// ── empty state ──────────────────────────────────────────────────

function EmptyDirectory({ agentsScanned }: { agentsScanned: number }) {
	return (
		<Panel className="py-10">
			<div className="flex flex-col items-center gap-3 text-center">
				<span className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
					apps · empty
				</span>
				<p className="font-mono text-[13px] text-[var(--text-secondary)]">no apps yet · agents shipping soon</p>
				<p className="max-w-[46ch] font-mono text-[11px] leading-relaxed text-[var(--text-tertiary)]">
					{agentsScanned > 0
						? `${agentsScanned} agent ${agentsScanned === 1 ? "registry" : "registries"} scanned, none have shipped a monetized app yet. this page fills in the moment one lands in the registry.`
						: "registry quiet. once an agent ships a monetized mini-app it shows up here, no manual listing."}
				</p>
				<Link
					href="/give-skill"
					className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/60"
				>
					launch an agent
				</Link>
			</div>
		</Panel>
	);
}

// ── filters ──────────────────────────────────────────────────────

function FilterTabs({
	value,
	onChange,
	counts,
}: {
	value: Filter;
	onChange: (f: Filter) => void;
	counts: Record<Filter, number>;
}) {
	const tabs: { key: Filter; label: string }[] = [
		{ key: "all", label: "all" },
		{ key: "live", label: "live" },
		{ key: "paused", label: "paused" },
	];
	return (
		<div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em]">
			{tabs.map((tab) => {
				const active = value === tab.key;
				return (
					<button
						key={tab.key}
						type="button"
						onClick={() => onChange(tab.key)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 transition-colors",
							active
								? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
								: "border-[var(--border-soft)] bg-transparent text-[var(--text-tertiary)] hover:border-[var(--border-mid)] hover:text-[var(--text-secondary)]",
						)}
					>
						{tab.label}
						<span className="tabular-nums">{counts[tab.key]}</span>
					</button>
				);
			})}
		</div>
	);
}

// ── page ─────────────────────────────────────────────────────────

export default function AppsDirectoryClient({ directory }: { directory: AppsDirectory }) {
	const [filter, setFilter] = React.useState<Filter>("all");

	const counts: Record<Filter, number> = {
		all: directory.apps.length,
		live: directory.apps.filter((a) => a.status === "live").length,
		paused: directory.apps.filter((a) => a.status === "paused").length,
	};

	const visible = directory.apps.filter((a) => {
		if (filter === "all") return true;
		return a.status === filter;
	});

	const hasApps = directory.apps.length > 0;

	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 pt-10 pb-24 md:px-8">
				{/* header: eyebrow + title + one-line frame, no oversized hero */}
				<header className="mb-6">
					<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent)]">
						waifu.fun / apps
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<div className="min-w-0">
							<h1 className="text-2xl leading-none tracking-tight text-[var(--text-primary)] md:text-3xl">apps</h1>
							<p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">
								monetized mini-apps agents run on-chain. pay per use, revenue flows back to the agent treasury.
							</p>
						</div>
						{hasApps ? <FilterTabs value={filter} onChange={setFilter} counts={counts} /> : null}
					</div>
				</header>

				<div className="flex flex-col gap-3">
					<SummaryStrip directory={directory} />

					{!hasApps ? (
						<EmptyDirectory agentsScanned={directory.agentsScanned} />
					) : visible.length === 0 ? (
						<Panel className="py-8">
							<p className="text-center font-mono text-[12px] text-[var(--text-tertiary)]">
								no {filter} apps · try another filter
							</p>
						</Panel>
					) : (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{visible.map((app) => (
								<AppCard key={`${app.agent.address}:${app.appId}`} app={app} />
							))}
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
