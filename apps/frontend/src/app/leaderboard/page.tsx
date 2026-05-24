"use client";

import { Hairline, Label, Panel, Pulse, THEME_TOKENS } from "@/components/agent-home/wave-t/_primitives";
import LeaderboardTable from "@/components/leaderboard/leaderboard-table";
import SortToggle from "@/components/leaderboard/sort-toggle";
import { useTranslation } from "@/contexts/locale-context";
import { type LeaderboardSort, useLeaderboard } from "@/lib/api/leaderboard";
import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { Suspense, useCallback, useMemo } from "react";

function parseSort(raw: string | null | undefined): LeaderboardSort {
	if (raw === "treasury" || raw === "burn" || raw === "runway") return raw;
	return "runway";
}

// Honest empty state. No glyph placeholders, no fake-zero cells. When the
// leaderboard has no entries (or when burn data hasn't landed) the panel
// says so in wave-t grammar: lowercase, mono caption, optional cta.
function EmptyState({ message, cta }: { message: string; cta?: { href: string; label: string } }) {
	return (
		<div className="flex flex-col items-start gap-3 px-4 py-10">
			<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
				<Pulse tone="accent" />
				{message}
			</div>
			{cta ? (
				<a
					className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)] hover:text-[var(--accent-dim)] transition-colors"
					href={cta.href}
				>
					{cta.label} →
				</a>
			) : null}
		</div>
	);
}

function LoadingState() {
	const { t } = useTranslation();
	return (
		<div className="flex items-center gap-2 px-4 py-10 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
			<Pulse tone="accent" />
			{t("common.loading2")}
		</div>
	);
}

function ErrorState({ message }: { message: string }) {
	const { t } = useTranslation();
	return (
		<div className="px-4 py-6 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--negative)]" role="alert">
			{t("leaderboard.feedError", { message })}
		</div>
	);
}

function LeaderboardContent() {
	const { t } = useTranslation();
	const router = useRouter();
	const searchParams = useSearchParams();
	const sort = useMemo(() => parseSort(searchParams?.get("sort")), [searchParams]);

	const { data, isLoading, error } = useLeaderboard(sort, 50);

	const handleSortChange = useCallback(
		(next: LeaderboardSort) => {
			const params = new URLSearchParams(searchParams?.toString() ?? "");
			if (next === "runway") {
				params.delete("sort");
			} else {
				params.set("sort", next);
			}
			const qs = params.toString();
			router.replace(qs ? `/leaderboard?${qs}` : "/leaderboard", { scroll: false });
		},
		[router, searchParams],
	);

	// Detect the "no real data" case: empty array, or every numeric field is
	// zero. With one agent live and burn data not yet wired this is the live
	// path. Honest empty state beats rows full of zeros.
	const allZero = useMemo(() => {
		if (!data || data.length === 0) return false;
		return data.every((e) => e.treasuryUsd === 0 && e.dailyBurnUsd === 0);
	}, [data]);

	const count = data?.length ?? 0;

	return (
		<Panel noPad>
			<div className="flex items-center justify-between gap-4 px-4 py-3">
				<Label>
					<Pulse tone="accent" />
					{t("leaderboard.runwayTitle")}
				</Label>
				<div className="flex items-center gap-3">
					<SortToggle onChange={handleSortChange} value={sort} />
					{count > 0 && !allZero ? (
						<span className="hidden font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] sm:inline">
							{t("leaderboard.countAgents", { count: String(count) })}
						</span>
					) : null}
				</div>
			</div>
			<Hairline />

			{isLoading ? (
				<LoadingState />
			) : error ? (
				<ErrorState message={(error as Error).message} />
			) : !data || data.length === 0 ? (
				<EmptyState
					cta={{ href: "/create/wizard", label: t("leaderboard.emptyCta") }}
					message={t("leaderboard.emptyMessage")}
				/>
			) : allZero ? (
				<>
					<LeaderboardTable entries={data} />
					<Hairline />
					<div className="px-4 py-3 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
						{t("leaderboard.waitingBurn")}
					</div>
				</>
			) : (
				<LeaderboardTable entries={data} />
			)}
		</Panel>
	);
}

export default function LeaderboardPage() {
	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6">
				<LeaderboardHeader />

				<Suspense fallback={<LoadingState />}>
					<LeaderboardContent />
				</Suspense>

				<LeaderboardFooter />
			</div>
		</main>
	);
}

function LeaderboardHeader() {
	const { t } = useTranslation();
	return (
		<header className="mb-4 flex items-end justify-between">
			<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
				{t("leaderboard.eyebrow")}
			</div>
			<a
				className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
				href="/agents"
			>
				{t("leaderboard.browseAllAgents")} →
			</a>
		</header>
	);
}

function LeaderboardFooter() {
	const { t } = useTranslation();
	return (
		<footer className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
			{t("leaderboard.footer")}
		</footer>
	);
}
