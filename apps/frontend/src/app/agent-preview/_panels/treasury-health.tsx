/**
 * <TreasuryHealth>
 *
 * Wave T worker B. Treasury health summary panel.
 *
 *   - Runway (days until burn exhausts NAV)
 *   - Liquid assets (USD valuation of all holdings)
 *   - Segmented allocation bar + legend pills (DeFi / Stables / AI Ops / Other)
 *
 * Honest data: today the agent only holds BNB so the allocation bar shows
 * a single segment. The component renders the full structure so adding
 * future allocations is just data, no layout work.
 */

"use client";

import { ArrowUpRight, Info } from "lucide-react";

import { BURN_USD_PER_MONTH, runwayDays } from "../lib/burn";
import { formatCompactUsd } from "../lib/format";
import type { HoldingsSnapshot } from "../lib/holdings";
import { Label, Panel, SectionTitle } from "./_primitives";

type TreasuryHealthProps = {
	holdings: HoldingsSnapshot;
};

type AllocationKey = "defi" | "stables" | "ops" | "other";
type Allocation = {
	key: AllocationKey;
	name: string;
	color: string;
	pct: number;
};

// Target runway band: anything past 180 days is "healthy". Anything under 30 is
// flashing red. The progress bar shows position within 0-180.
const RUNWAY_TARGET_DAYS = 180;

export function TreasuryHealth({ holdings }: TreasuryHealthProps) {
	const nav = holdings.navUsd;
	const days = runwayDays(nav);
	const runwayPct = Math.max(0, Math.min(100, (days / RUNWAY_TARGET_DAYS) * 100));

	// Allocation breakdown. Today: 100% BNB ("DeFi" bucket since BNB on a CEX
	// is not what we hold; this is L1 native). The structure scales when
	// stables/etc are added by tweaking these numbers.
	const allocations: Allocation[] =
		nav > 0
			? [
					{ key: "defi", name: "DeFi", color: "var(--positive)", pct: 100 },
					{ key: "stables", name: "Stables", color: "#5fbcd6", pct: 0 },
					{ key: "ops", name: "AI Ops", color: "rgba(255,255,255,0.32)", pct: 0 },
					{ key: "other", name: "Other", color: "rgba(255,255,255,0.18)", pct: 0 },
				]
			: [
					{ key: "defi", name: "DeFi", color: "var(--positive)", pct: 0 },
					{ key: "stables", name: "Stables", color: "#5fbcd6", pct: 0 },
					{ key: "ops", name: "AI Ops", color: "rgba(255,255,255,0.32)", pct: 0 },
					{ key: "other", name: "Other", color: "rgba(255,255,255,0.18)", pct: 0 },
				];

	const liquidPctOfTreasury = 100; // we have one asset, all liquid

	return (
		<Panel>
			<Label
				right={
					<a
						className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
						href="/agent-preview/trading"
					>
						View Report
						<ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
					</a>
				}
			>
				<span>Treasury Health</span>
				<Info className="h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={1.5} />
			</Label>

			{/* ── Top two-column: Runway + Liquid Assets ──────────────── */}
			<div className="grid gap-5 md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<SectionTitle>Runway</SectionTitle>
					<div className="flex items-baseline gap-2">
						<span className="font-mono text-[28px] tabular-nums leading-none text-[var(--text-primary)]">
							{days >= 9999 ? "∞" : days.toLocaleString("en-US")}
						</span>
						<span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">days</span>
					</div>
					<span className="font-mono text-[11px] text-[var(--text-secondary)]">until critical threshold</span>
					<div
						aria-label={`Runway progress: ${Math.round(runwayPct)} percent of ${RUNWAY_TARGET_DAYS}-day target`}
						aria-valuemax={RUNWAY_TARGET_DAYS}
						aria-valuemin={0}
						aria-valuenow={Math.min(days, RUNWAY_TARGET_DAYS)}
						className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]"
						role="progressbar"
						tabIndex={-1}
					>
						<div
							className="h-full rounded-full transition-all"
							style={{
								background: "var(--accent)",
								boxShadow: "0 0 6px var(--accent)",
								width: `${runwayPct}%`,
							}}
						/>
					</div>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						burn ${BURN_USD_PER_MONTH}/mo
					</span>
				</div>

				<div className="flex flex-col gap-2">
					<SectionTitle>Liquid Assets</SectionTitle>
					<span className="font-mono text-[28px] tabular-nums leading-none text-[var(--text-primary)]">
						{formatCompactUsd(nav)}
					</span>
					<span className="font-mono text-[11px] text-[var(--text-secondary)]">{liquidPctOfTreasury}% of treasury</span>
				</div>
			</div>

			{/* ── Current Allocations ─────────────────────────────────── */}
			<div className="mt-6 flex flex-col gap-3">
				<SectionTitle>Current Allocations</SectionTitle>
				<AllocationBar allocations={allocations} />
				<div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
					{allocations.map((a) => (
						<LegendPill allocation={a} key={a.key} />
					))}
				</div>
			</div>
		</Panel>
	);
}

function AllocationBar({ allocations }: { allocations: Allocation[] }) {
	const visible = allocations.filter((a) => a.pct > 0);
	if (visible.length === 0) {
		return (
			<div className="h-3.5 w-full rounded-full bg-white/[0.05]">
				<span className="sr-only">No allocation data yet</span>
			</div>
		);
	}
	return (
		<div
			aria-label="Treasury allocation breakdown"
			className="flex h-3.5 w-full overflow-hidden rounded-full bg-white/[0.03]"
			role="img"
		>
			{visible.map((a, i) => (
				<div
					className={
						i === 0
							? "h-full"
							: i === visible.length - 1
								? "h-full border-l border-[var(--bg-panel)]"
								: "h-full border-l border-[var(--bg-panel)]"
					}
					key={a.key}
					style={{
						background: a.color,
						width: `${a.pct}%`,
					}}
					title={`${a.name} ${a.pct.toFixed(1)}%`}
				/>
			))}
		</div>
	);
}

function LegendPill({ allocation }: { allocation: Allocation }) {
	return (
		<div className="inline-flex items-center gap-2">
			<span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: allocation.color }} />
			<span className="font-mono text-[11px] text-[var(--text-secondary)]">{allocation.name}</span>
			<span className="font-mono text-[11px] tabular-nums text-[var(--text-primary)]">
				{allocation.pct.toFixed(1)}%
			</span>
		</div>
	);
}
