/**
 * Holdings Allocation donut (Wave T worker B v2).
 *
 * Renders a multi-asset donut from \`lib/holdings.ts\`. Each holding is one
 * slice colored from a palette of CSS-variable-derived hues. The donut
 * shows the NAV in USD in the center. Legend on the right shows up to
 * five entries with name + percentage.
 *
 * Honest empty state: when there is only a single asset (today: BNB on
 * Sol burner), we still render a clean single-arc ring with a hint that
 * additional chains are scheduled.
 */

"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

import type { ChainHolding, HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Label, Panel, TokenIcon } from "./_primitives";

const SLICE_COLORS = [
	"var(--accent)",
	"#7dd3fc", // sky
	"#fbbf24", // amber
	"#a78bfa", // violet
	"#f87171", // soft red
	"#f472b6", // pink
];

function fmtUsd(v: number): string {
	if (!Number.isFinite(v) || v <= 0) return "$0.00";
	if (v >= 1000) {
		return v.toLocaleString("en-US", {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 0,
		});
	}
	return v.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

type Slice = {
	key: string;
	label: string;
	sub: string;
	valueUsd: number;
	pct: number;
	color: string;
	chain: TokenChain;
};

const CHAIN_KEY_TO_TOKEN_CHAIN: Record<string, TokenChain> = {
	bsc: "bsc",
	eth: "ethereum",
	arb: "ethereum",
	base: "base",
	op: "ethereum",
};

function toSlices(holdings: ChainHolding[], navUsd: number): Slice[] {
	// Filter zero-value entries; sort desc by value.
	const live = holdings.filter((h) => h.valueUsd > 0).sort((a, b) => b.valueUsd - a.valueUsd);

	if (live.length === 0) return [];

	return live.slice(0, 6).map((h, i) => ({
		key: `${h.chain}-${h.asset}`,
		label: h.asset,
		sub: h.chainName,
		valueUsd: h.valueUsd,
		pct: navUsd > 0 ? (h.valueUsd / navUsd) * 100 : 0,
		color: SLICE_COLORS[i % SLICE_COLORS.length] ?? "var(--accent)",
		chain: CHAIN_KEY_TO_TOKEN_CHAIN[h.chain] ?? "ethereum",
	}));
}

export function HoldingsAllocation({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const slices = useMemo(() => toSlices(snapshot.holdings, snapshot.navUsd), [snapshot]);
	const hasData = slices.length > 0;

	// Recharts wants a value array. When empty we still draw a faint ring
	// so the panel doesn't collapse to text.
	const chartData = hasData ? slices.map((s) => ({ name: s.key, value: s.valueUsd })) : [{ name: "empty", value: 1 }];

	return (
		<Panel className="flex h-full flex-col">
			<Label>holdings allocation</Label>
			<div className="flex flex-1 items-center gap-4">
				{/* Donut */}
				<div className="relative h-[150px] w-[150px] shrink-0">
					<ResponsiveContainer height="100%" width="100%">
						<PieChart>
							<Pie
								cx="50%"
								cy="50%"
								data={chartData}
								dataKey="value"
								endAngle={-270}
								innerRadius={50}
								isAnimationActive={false}
								outerRadius={70}
								paddingAngle={hasData && slices.length > 1 ? 2 : 0}
								startAngle={90}
								stroke="none"
							>
								{hasData
									? slices.map((s) => <Cell fill={s.color} key={s.key} />)
									: [<Cell fill="rgba(255,255,255,0.05)" key="empty" />]}
							</Pie>
						</PieChart>
					</ResponsiveContainer>
					{/* Center label */}
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
						<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">nav</span>
						<span className="font-mono text-[14px] text-[var(--text-primary)] tabular-nums">
							{fmtUsd(snapshot.navUsd)}
						</span>
					</div>
				</div>

				{/* Legend */}
				<ul className="flex min-w-0 flex-1 flex-col gap-1.5">
					{hasData ? (
						slices.map((s) => (
							<li className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums" key={s.key}>
								<span className="flex min-w-0 items-center gap-2">
									<span
										aria-hidden
										className="inline-block h-2 w-2 shrink-0 rounded-full"
										style={{ backgroundColor: s.color }}
									/>
									<TokenIcon address="" chain={s.chain} size={14} symbol={s.label} />
									<span className="truncate text-[var(--text-primary)]">{s.label}</span>
									<span className="truncate text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
										{s.sub}
									</span>
								</span>
								<span className="text-[var(--text-secondary)]">{s.pct.toFixed(1)}%</span>
							</li>
						))
					) : (
						<li className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							no funded chains yet
						</li>
					)}
				</ul>
			</div>
			<footer
				className={cn(
					"mt-3 border-t border-[var(--border-soft)] pt-2 font-mono text-[9px] uppercase tracking-[0.18em]",
					hasData ? "text-[var(--text-tertiary)]" : "text-[var(--text-tertiary)]",
				)}
			>
				{hasData
					? `${slices.length} chain${slices.length === 1 ? "" : "s"} funded · multi-chain expansion scheduled`
					: "Sol burner unfunded · awaiting first deposit"}
			</footer>
		</Panel>
	);
}

export default HoldingsAllocation;
