"use client";

/**
 * /launches index. Lists active launches via `GET /v2/launches` with filters
 * for state and tier. Mirrors the visual language of /agents.
 *
 * State filter: open / closed / launched / failed / all
 * Tier filter:  80 / 90 / 95 / 98 / all
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

import { LaunchCard, LaunchCardSkeleton } from "@/components/launches-discover/launch-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import {
	type FetchLaunchesParams,
	type LaunchListState,
	type LaunchListTier,
	useLaunchesList,
} from "@/lib/api/launches-list";
import { cn } from "@/lib/utils";

const STATE_OPTIONS: Array<{ value: LaunchListState | "all"; label: string }> = [
	{ value: "all", label: "all" },
	{ value: "open", label: "open" },
	{ value: "closed", label: "closed" },
	{ value: "launched", label: "launched" },
	{ value: "failed", label: "failed" },
];

const TIER_OPTIONS: Array<{ value: LaunchListTier | "all"; label: string }> = [
	{ value: "all", label: "all" },
	{ value: 80, label: "80" },
	{ value: 90, label: "90" },
	{ value: 95, label: "95" },
	{ value: 98, label: "98" },
];

function parseStateFilter(v: string | null): LaunchListState | "all" {
	if (v === "open" || v === "closed" || v === "launched" || v === "failed") return v;
	return "all";
}

function parseTierFilter(v: string | null): LaunchListTier | "all" {
	const n = Number(v);
	if (n === 80 || n === 90 || n === 95 || n === 98) return n;
	return "all";
}

function LaunchesInner() {
	const searchParams = useSearchParams();
	const state = parseStateFilter(searchParams.get("state"));
	const tier = parseTierFilter(searchParams.get("tier"));

	const params = useMemo<FetchLaunchesParams>(() => {
		const p: FetchLaunchesParams = { limit: 30 };
		if (state !== "all") p.state = state;
		if (tier !== "all") p.tier = tier;
		return p;
	}, [state, tier]);

	const { data, isLoading, error, refetch } = useLaunchesList(params);

	const launches = data?.launches ?? [];
	const total = data?.total ?? 0;
	const showSkeleton = isLoading && !data;

	return (
		<PageShell maxWidth="wide">
			<PageHeader
				eyebrow="waifu.fun / launches"
				title="launches"
				subtitle="open rounds take bnb for 24h, then graduate to pancake v2."
				right={
					!showSkeleton ? (
						<div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/45">
							<span className="text-white/80 tabular-nums">{total.toLocaleString()}</span>{" "}
							<span>round{total === 1 ? "" : "s"}</span>
						</div>
					) : (
						<div className="h-3 w-32 bg-white/5 rounded-sm" />
					)
				}
			/>

			<FilterBar state={state} tier={tier} />

			<div className="mt-8">
				{error ? (
					<ErrorState
						title="couldn't load launches."
						message={error instanceof Error ? error.message : "unknown error"}
						onRetry={() => void refetch()}
					/>
				) : showSkeleton ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{Array.from({ length: 9 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<LaunchCardSkeleton key={i} />
						))}
					</div>
				) : launches.length === 0 ? (
					<EmptyState
						title={
							state === "all"
								? "no launches yet."
								: state === "open"
									? "nothing live right now."
									: `no ${state} rounds.`
						}
						body={
							state === "open" ? "be the first, or check back soon." : "try a different filter, or launch your own."
						}
						ctaHref="/create/wizard"
						ctaLabel="launch yours"
					/>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{launches.map((launch) => (
							<LaunchCard key={launch.id} launch={launch} />
						))}
					</div>
				)}
			</div>
		</PageShell>
	);
}

function FilterBar({
	state,
	tier,
}: {
	state: LaunchListState | "all";
	tier: LaunchListTier | "all";
}) {
	const baseHref = (next: { state?: string; tier?: string }) => {
		const sp = new URLSearchParams();
		const s = next.state ?? (state === "all" ? "" : state);
		const t = next.tier ?? (tier === "all" ? "" : String(tier));
		if (s) sp.set("state", s);
		if (t) sp.set("tier", t);
		const qs = sp.toString();
		return qs ? `/launches?${qs}` : "/launches";
	};

	return (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-white/10 py-3 text-[11px] font-mono uppercase tracking-[0.18em]">
			<FilterGroup label="state">
				{STATE_OPTIONS.map((opt) => {
					const active = state === opt.value;
					return (
						<Link
							key={opt.value}
							href={baseHref({ state: opt.value === "all" ? "" : (opt.value as string) })}
							className={cn(
								"px-2 py-1 rounded-sm transition-colors",
								active ? "bg-[#00ff87]/10 text-[#00ff87]" : "text-white/50 hover:text-white/80",
							)}
						>
							{opt.label}
						</Link>
					);
				})}
			</FilterGroup>
			<FilterGroup label="tier">
				{TIER_OPTIONS.map((opt) => {
					const active = tier === opt.value;
					return (
						<Link
							key={opt.value}
							href={baseHref({ tier: opt.value === "all" ? "" : String(opt.value) })}
							className={cn(
								"px-2 py-1 rounded-sm transition-colors",
								active ? "bg-[#00ff87]/10 text-[#00ff87]" : "text-white/50 hover:text-white/80",
							)}
						>
							{opt.label}
						</Link>
					);
				})}
			</FilterGroup>
		</div>
	);
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-white/30">{label}</span>
			<div className="flex items-center gap-1">{children}</div>
		</div>
	);
}

function LaunchesFallback() {
	return (
		<PageShell maxWidth="wide">
			<PageHeader
				eyebrow="waifu.fun / launches"
				title="launches"
				subtitle="open rounds take bnb for 24h, then graduate to pancake v2."
			/>
			<div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				{Array.from({ length: 6 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
					<LaunchCardSkeleton key={i} />
				))}
			</div>
		</PageShell>
	);
}

export default function LaunchesDiscoverClient() {
	return (
		<Suspense fallback={<LaunchesFallback />}>
			<LaunchesInner />
		</Suspense>
	);
}
