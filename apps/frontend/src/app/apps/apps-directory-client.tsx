/**
 * Apps directory. The discovery surface for "agents do work you can pay for".
 *
 * Dense, live, tpot per .impeccable.md. Composes only wave-t primitives.
 * Data-driven: rows come from the apps registry aggregator. No fixtures.
 * Empty registry renders the honest wave-t empty state.
 *
 * Layout reads as a cockpit, not a card gallery:
 *   - a summary strip up top (live count, rev, agents scanned)
 *   - a featured rail for flagship / platform apps (asymmetric, not 3-equal)
 *   - the rest grouped by category (chat / trading / content / image / infra)
 *     so apps doing the same job sit together
 * Filters scope to all / live / scheduled (paused only appears if real).
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
import { ElizaCloudIcon, StewardIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";
import type { AppStatus } from "@/lib/wave-t/apps";
import { fetchAppsDirectory } from "@/lib/wave-t/apps-directory";
import {
	type AppCategory,
	type AppsDirectory,
	CATEGORY_LABEL,
	CATEGORY_ORDER,
	type DirectoryApp,
	appCategory,
	appMeta,
	appPricePerUseUsd,
} from "@/lib/wave-t/apps-directory-types";
import { formatCompactUsd } from "@/lib/wave-t/format";

type Filter = "all" | "live" | "scheduled" | "paused";

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

// Honest timeline caption. live/paused apps that have actually shipped show
// "shipped Xago"; scheduled apps only have a registry entry, so they read
// "registered Xago" (never "shipped", which would be a lie). Falls back to a
// neutral "registry entry" when no timestamp is present.
function timelineCaption(app: DirectoryApp): string {
	if (app.status === "scheduled") {
		const seen = relativeTime(app.createdAt);
		return seen ? `registered ${seen}` : "registry entry";
	}
	const shipped = relativeTime(app.shippedAt ?? app.createdAt);
	return shipped ? `shipped ${shipped}` : "registry entry";
}

function priceLabel(app: DirectoryApp): string {
	const p = appPricePerUseUsd(app);
	if (p === null) return "free";
	if (p < 0.01) return `$${p.toFixed(4)}/use`;
	return `$${p.toFixed(2)}/use`;
}

// Resolve a real logo for the well-known platform apps so the directory
// matches the agent page (which uses the same brand icons). Everything else
// falls back to a monogram tile, accent-tinted when the app is live.
const BRAND_LOGO_URLS: Record<string, string> = {
	waifu: "/brand/icon/icon_256.png",
	steward: "https://steward.fi/favicon.svg",
	eliza: "/eliza-cloud/eliza.png",
	"eliza-cloud": "/eliza-cloud/eliza.png",
	elizacloud: "/eliza-cloud/eliza.png",
};
const BRAND_ICON: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
	waifu: WaifuIcon,
	steward: StewardIcon,
	eliza: ElizaCloudIcon,
	"eliza-cloud": ElizaCloudIcon,
	elizacloud: ElizaCloudIcon,
	"twitter-replies": XIcon,
	content: XIcon,
};

function AppGlyph({ app, size = 30 }: { app: DirectoryApp; size?: number }) {
	const [failed, setFailed] = React.useState(false);
	const live = app.status === "live";
	const httpIcon = app.icon?.startsWith("http") ? app.icon : null;
	const brandUrl = BRAND_LOGO_URLS[app.appId];
	const src = httpIcon ?? brandUrl ?? null;
	const dim = { width: size, height: size };
	const tile = cn(
		"inline-flex shrink-0 items-center justify-center rounded-md",
		live ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-white/[0.03] text-[var(--text-tertiary)]",
	);
	const tileStyle: React.CSSProperties = { ...dim, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" };

	if (src && !failed) {
		return (
			<span className={tile} style={tileStyle}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					alt=""
					src={src}
					onError={() => setFailed(true)}
					className="rounded-[5px] object-cover"
					style={{ width: size - 8, height: size - 8 }}
				/>
			</span>
		);
	}

	const BrandIcon = BRAND_ICON[app.appId];
	if (BrandIcon) {
		return (
			<span className={tile} style={tileStyle}>
				<BrandIcon width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} />
			</span>
		);
	}

	return (
		<span aria-hidden className={tile} style={{ ...tileStyle, fontSize: Math.round(size * 0.42) }}>
			<span className="font-mono uppercase">{(app.name || app.appId || "?").slice(0, 1)}</span>
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
	if (status === "paused") return <StatPill tone="neutral">paused</StatPill>;
	return <StatPill tone="neutral">scheduled</StatPill>;
}

function DeltaTag({ delta }: { delta: number }) {
	const positive = delta > 0;
	const negative = delta < 0;
	return (
		<span
			className={cn(
				"font-mono text-[10px] tabular-nums",
				positive && "text-[var(--positive)]",
				negative && "text-[var(--negative)]",
				!positive && !negative && "text-[var(--text-tertiary)]",
			)}
		>
			{positive ? "+" : ""}
			{delta.toFixed(1)}% vs prev 7d
		</span>
	);
}

// The action affordance. live (and paused) apps with a url get a "use" button;
// scheduled apps NEVER get a live link even if the registry already carries a
// url, since the app is explicitly not open yet, they show "coming soon".
// everything else degrades to a quiet caption. No dead "no entry yet" buttons.
function AppAction({ app, prominent = false }: { app: DirectoryApp; prominent?: boolean }) {
	if (app.status === "scheduled") {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--border-soft)] bg-white/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				coming soon
			</span>
		);
	}
	const appUrl = app.appUrl;
	const isExternal = Boolean(appUrl?.startsWith("http"));
	if (appUrl) {
		const liveLook = app.status === "live";
		return (
			<a
				href={appUrl}
				target={isExternal ? "_blank" : undefined}
				rel={isExternal ? "noopener noreferrer" : undefined}
				className={cn(
					"group/use inline-flex items-center gap-1.5 rounded-sm border font-mono uppercase tracking-[0.18em] transition-colors active:translate-y-px",
					prominent ? "px-3.5 py-1.5 text-[10px]" : "px-3 py-1 text-[10px]",
					liveLook
						? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]/70"
						: "border-[var(--border-mid)] bg-white/[0.02] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]",
				)}
			>
				use
				<svg
					width="11"
					height="11"
					viewBox="0 0 12 12"
					fill="none"
					aria-hidden
					role="img"
					className="transition-transform group-hover/use:translate-x-0.5 group-hover/use:-translate-y-0.5"
				>
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
		);
	}
	return (
		<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">no link yet</span>
	);
}

function AgentByline({ app }: { app: DirectoryApp }) {
	return (
		<Link
			href={`/agent/${app.agent.address}`}
			className="inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[10px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
		>
			<span className="truncate">by {app.agent.name}</span>
			{app.agent.ticker ? (
				<span className="shrink-0 uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{app.agent.ticker}</span>
			) : null}
		</Link>
	);
}

// ── featured card (flagship apps, wider treatment) ───────────────

function FeaturedCard({ app }: { app: DirectoryApp }) {
	const meta = appMeta(app);
	const tagline = meta.tagline ?? app.description ?? null;
	const delta = app.revenue7dDeltaPct;

	return (
		<Panel className="flex flex-col gap-4 md:p-6">
			<div className="flex items-start gap-3.5">
				<AppGlyph app={app} size={40} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate text-[15px] tracking-tight text-[var(--text-primary)]">{app.name}</span>
						<Pulse tone="accent" />
					</div>
					<div className="mt-1">
						<AgentByline app={app} />
					</div>
				</div>
				<StatusTag status={app.status} />
			</div>

			{tagline ? (
				<p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{tagline}</p>
			) : null}

			<Hairline />

			<div className="flex items-end justify-between gap-4">
				<div className="grid grid-cols-3 gap-5">
					<MicroStat
						label="rev 7d"
						value={app.revenue7dUsd > 0 ? formatCompactUsd(app.revenue7dUsd) : "$0"}
						tone={app.revenue7dUsd > 0 ? "accent" : "neutral"}
					/>
					<MicroStat label="lifetime" value={formatCompactUsd(app.revenueLifetimeUsd)} />
					<MicroStat label="price" value={priceLabel(app)} />
				</div>
				<AppAction app={app} prominent />
			</div>

			<div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span>{timelineCaption(app)}</span>
				{delta !== null ? <DeltaTag delta={delta} /> : null}
			</div>
		</Panel>
	);
}

// ── standard app card ────────────────────────────────────────────

function AppCard({ app }: { app: DirectoryApp }) {
	const meta = appMeta(app);
	const tagline = meta.tagline ?? app.description ?? null;
	const shipped = relativeTime(app.shippedAt ?? app.createdAt);
	const delta = app.revenue7dDeltaPct;

	return (
		<Panel className="flex flex-col">
			<div className="flex items-start gap-3">
				<AppGlyph app={app} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate text-[13px] text-[var(--text-primary)]">{app.name}</span>
						{meta.featured ? <Pulse tone="accent" /> : null}
					</div>
					<div className="mt-0.5">
						<AgentByline app={app} />
					</div>
				</div>
				<StatusTag status={app.status} />
			</div>

			<p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
				{tagline ?? (shipped ? `first seen ${shipped}` : "no description yet")}
			</p>

			<Hairline className="my-3" />

			<div className="grid grid-cols-3 gap-3">
				<MicroStat
					label="rev 7d"
					value={app.revenue7dUsd > 0 ? formatCompactUsd(app.revenue7dUsd) : "$0"}
					tone={app.revenue7dUsd > 0 ? "accent" : "neutral"}
				/>
				<MicroStat label="lifetime" value={formatCompactUsd(app.revenueLifetimeUsd)} />
				<MicroStat label="price" value={priceLabel(app)} />
			</div>

			{delta !== null ? <div className="mt-2">{<DeltaTag delta={delta} />}</div> : null}

			<div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3">
				<span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{timelineCaption(app)}
				</span>
				<AppAction app={app} />
			</div>
		</Panel>
	);
}

// ── summary strip ────────────────────────────────────────────────

function SummaryStrip({ directory }: { directory: AppsDirectory }) {
	const { apps, liveCount, totalRevenue7d, totalLifetime, agentsScanned } = directory;
	const hasApps = apps.length > 0;
	return (
		<Panel>
			<Label
				right={
					hasApps ? (
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
					<span className="font-mono text-[30px] font-light leading-none text-[var(--accent)] tabular-nums">
						{liveCount}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<SectionTitle>registered</SectionTitle>
					<span className="font-mono text-[30px] font-light leading-none text-[var(--text-primary)] tabular-nums">
						{apps.length}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<SectionTitle>rev 7d</SectionTitle>
					<span className="font-mono text-[30px] font-light leading-none text-[var(--text-primary)] tabular-nums">
						{formatCompactUsd(totalRevenue7d)}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<SectionTitle>lifetime</SectionTitle>
					<span className="font-mono text-[30px] font-light leading-none text-[var(--text-primary)] tabular-nums">
						{formatCompactUsd(totalLifetime)}
					</span>
				</div>
			</div>
			<Hairline className="my-3" />
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span>
					{agentsScanned > 0
						? `scanned ${agentsScanned} agent ${agentsScanned === 1 ? "registry" : "registries"}`
						: "no agents online"}
				</span>
				{totalRevenue7d === 0 && hasApps ? (
					<>
						<span className="text-[var(--border-mid)]">·</span>
						<span>revenue counters wire on eliza cloud billing</span>
					</>
				) : null}
			</div>
		</Panel>
	);
}

// ── category section header ──────────────────────────────────────

function CategoryHeader({ category, count }: { category: AppCategory; count: number }) {
	return (
		<div className="mb-3 flex items-center gap-2.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">
				{CATEGORY_LABEL[category]}
			</span>
			<span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">{count}</span>
			<div className="h-px flex-1 bg-[var(--border-soft)]" />
		</div>
	);
}

// ── empty state ──────────────────────────────────────────────────

function EmptyDirectory({ agentsScanned }: { agentsScanned: number }) {
	return (
		<Panel className="py-10">
			<div className="flex flex-col items-center gap-3 text-center">
				<span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
					<Pulse tone="accent" />
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
	tabs,
}: {
	value: Filter;
	onChange: (f: Filter) => void;
	counts: Record<Filter, number>;
	tabs: { key: Filter; label: string }[];
}) {
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

// ── page shell + loading/error ──────────────────────────────────────

// Shared chrome so the loading and error states sit inside the same cockpit
// frame the loaded directory uses (one max-w container, one theme application).
function DirectoryShell({ children }: { children: React.ReactNode }) {
	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6">
				<header className="mb-5">
					<div className="flex items-end justify-between gap-4">
						<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
							waifu.fun / apps
						</div>
						<Link
							href="/agents"
							className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
						>
							browse all agents →
						</Link>
					</div>
					<p className="mt-3 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
						monetized mini-apps agents run on-chain. pay per use, revenue flows back to the agent treasury.
					</p>
				</header>
				{children}
			</div>
		</main>
	);
}

function DirectoryLoading() {
	return (
		<div className="flex flex-col gap-3">
			<Panel className="py-8">
				<p className="text-center font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					loading apps directory
				</p>
			</Panel>
		</div>
	);
}

function DirectoryFetchFailed() {
	return (
		<div className="flex flex-col gap-3">
			<Panel className="py-8">
				<p className="text-center font-mono text-[12px] text-[var(--text-tertiary)]">
					no data yet · onchain feed quiet
				</p>
			</Panel>
		</div>
	);
}

// ── page ─────────────────────────────────────────────────────────

// The frontend ships as a static export (`output: "export"`), so fetching the
// directory in the server component would freeze it to a build-time snapshot.
// Instead we fetch client-side in a `useEffect`, the same pattern `/agents`
// uses, so the directory is LIVE on every visit. The page renders an honest
// loading state until the first fetch lands, then paints the real directory.
export default function AppsDirectoryClient() {
	const [directory, setDirectory] = React.useState<AppsDirectory | null>(null);
	const [errored, setErrored] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		setErrored(false);
		fetchAppsDirectory()
			.then((next) => {
				if (!cancelled) setDirectory(next);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				console.error("apps directory fetch failed", err);
				setErrored(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!directory) {
		return <DirectoryShell>{errored ? <DirectoryFetchFailed /> : <DirectoryLoading />}</DirectoryShell>;
	}

	return <AppsDirectoryView directory={directory} />;
}

function AppsDirectoryView({ directory }: { directory: AppsDirectory }) {
	const [filter, setFilter] = React.useState<Filter>("all");

	const counts: Record<Filter, number> = {
		all: directory.apps.length,
		live: directory.apps.filter((a) => a.status === "live").length,
		scheduled: directory.apps.filter((a) => a.status === "scheduled").length,
		paused: directory.apps.filter((a) => a.status === "paused").length,
	};

	// Only surface tabs that actually have rows behind them (plus all/live so
	// the control never collapses to a single button). paused stays hidden
	// until a real paused app exists.
	const tabs: { key: Filter; label: string }[] = React.useMemo(() => {
		const base: { key: Filter; label: string }[] = [
			{ key: "all", label: "all" },
			{ key: "live", label: "live" },
		];
		if (counts.scheduled > 0) base.push({ key: "scheduled", label: "scheduled" });
		if (counts.paused > 0) base.push({ key: "paused", label: "paused" });
		return base;
	}, [counts.scheduled, counts.paused]);

	const visible = directory.apps.filter((a) => (filter === "all" ? true : a.status === filter));

	// Featured apps own a top rail; the remainder groups by category. Featured
	// flag comes from metadata (platform products mark themselves featured).
	const featured = visible.filter((a) => appMeta(a).featured);
	const rest = visible.filter((a) => !appMeta(a).featured);

	const grouped = React.useMemo(() => {
		const map = new Map<AppCategory, DirectoryApp[]>();
		for (const app of rest) {
			const c = appCategory(app);
			const arr = map.get(c) ?? [];
			arr.push(app);
			map.set(c, arr);
		}
		return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, apps: map.get(c)! }));
	}, [rest]);

	const hasApps = directory.apps.length > 0;

	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6">
				{/* header: mono eyebrow grammar, matches /leaderboard. no oversized H1. */}
				<header className="mb-5">
					<div className="flex items-end justify-between gap-4">
						<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
							waifu.fun / apps
						</div>
						<Link
							href="/agents"
							className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
						>
							browse all agents →
						</Link>
					</div>
					<div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
						<p className="max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
							monetized mini-apps agents run on-chain. pay per use, revenue flows back to the agent treasury.
						</p>
						{hasApps ? <FilterTabs value={filter} onChange={setFilter} counts={counts} tabs={tabs} /> : null}
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
						<>
							{/* featured rail: flagship apps, asymmetric 2-up (never 3-equal). */}
							{featured.length > 0 ? (
								<section>
									<div className="mb-3 flex items-center gap-2.5">
										<span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent)]">
											<Pulse tone="accent" />
											featured
										</span>
										<div className="h-px flex-1 bg-[var(--border-soft)]" />
									</div>
									<div
										className={cn("grid gap-3", featured.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}
									>
										{featured.map((app) => (
											<FeaturedCard key={`${app.agent.address}:${app.appId}`} app={app} />
										))}
									</div>
								</section>
							) : null}

							{/* remainder, grouped by category. each group is its own dense grid. */}
							{grouped.map(({ category, apps }) => (
								<section key={category}>
									<CategoryHeader category={category} count={apps.length} />
									{/* grid tracks the row count so a 2-app group never leaves a dead
									    3rd column. only widen to 3-up once there are 3+ apps. */}
									<div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", apps.length >= 3 && "lg:grid-cols-3")}>
										{apps.map((app) => (
											<AppCard key={`${app.agent.address}:${app.appId}`} app={app} />
										))}
									</div>
								</section>
							))}
						</>
					)}
				</div>

				<footer className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					apps appear automatically once an agent ships a monetized mini-app
				</footer>
			</div>
		</main>
	);
}
