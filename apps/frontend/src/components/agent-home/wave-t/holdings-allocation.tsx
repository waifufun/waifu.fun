/**
 * Holdings Allocation panel (Wave T worker B, sophistication pass 2026-05-22).
 *
 * Renders a dense, monochrome composition strip for the agent's multi-asset
 * NAV. The previous version used a rainbow palette (sky / amber / violet /
 * pink / red) which broke the single-accent brand rule. This version uses
 * tinted greens only, with the rest of the visual weight on a tabular
 * legend table.
 *
 * Layout:
 *   - 88px monochrome donut on the left (visual signal only)
 *   - tabular legend on the right: asset / chain / pct, right-aligned
 *
 * Data: rows already aggregated by (chain, contract || asset) upstream in
 * `holdingsSnapshotFromApi`, so multi-wallet contributions to the same
 * on-chain asset collapse to a single legend row.
 *
 * Honest empty state: when there are no priced rows we render the donut
 * as a faint ring and a single-line message in wave-t grammar.
 */

"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

import type { ChainHolding, HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Label, Panel, TokenIcon } from "./_primitives";

// Monochrome ramp anchored on --accent. Strict single-hue brand
// discipline: every slice is a tinted green, never amber / violet / sky.
const SLICE_OPACITIES = [1, 0.7, 0.5, 0.36, 0.24, 0.16];

const CHAIN_KEY_TO_TOKEN_CHAIN: Record<string, TokenChain> = {
	bsc: "bsc",
	eth: "ethereum",
	arb: "ethereum",
	base: "base",
	op: "ethereum",
};

type Slice = {
	key: string;
	label: string;
	sub: string;
	valueUsd: number;
	pct: number;
	fill: string;
	chain: TokenChain;
};

function toSlices(holdings: ChainHolding[], navUsd: number): Slice[] {
	const live = holdings.filter((h) => h.valueUsd > 0).sort((a, b) => b.valueUsd - a.valueUsd);
	if (live.length === 0) return [];

	return live.slice(0, 6).map((h, i) => {
		const opacity = SLICE_OPACITIES[i] ?? 0.12;
		return {
			key: `${h.chain}-${h.contract ?? h.asset}`,
			label: h.asset,
			sub: h.chainName.toLowerCase(),
			valueUsd: h.valueUsd,
			pct: navUsd > 0 ? (h.valueUsd / navUsd) * 100 : 0,
			// Use rgba with the accent-soft palette so every slice reads as
			// the same hue at different intensities.
			fill: `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, transparent)`,
			chain: CHAIN_KEY_TO_TOKEN_CHAIN[h.chain] ?? "ethereum",
		};
	});
}

export function HoldingsAllocation({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const slices = useMemo(() => toSlices(snapshot.holdings, snapshot.navUsd), [snapshot]);
	const hasData = slices.length > 0;

	// Recharts wants at least one row; draw a faint ring when empty.
	const chartData = hasData ? slices.map((s) => ({ name: s.key, value: s.valueUsd })) : [{ name: "empty", value: 1 }];

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					hasData ? (
						<span className="font-mono text-[9px] uppercase tabular-nums tracking-[0.18em] text-[var(--text-tertiary)]">
							{slices.length} {slices.length === 1 ? "asset" : "assets"}
						</span>
					) : null
				}
			>
				holdings allocation
			</Label>

			<div className="flex flex-1 items-center gap-4">
				{/* Donut – signal only, no center label (the value lives in
				    the hero). Sized down to 96px so the legend table can
				    carry the real density. */}
				<div className="relative h-[96px] w-[96px] shrink-0">
					<ResponsiveContainer height="100%" width="100%">
						<PieChart>
							<Pie
								cx="50%"
								cy="50%"
								data={chartData}
								dataKey="value"
								endAngle={-270}
								innerRadius={34}
								isAnimationActive={false}
								outerRadius={46}
								paddingAngle={hasData && slices.length > 1 ? 1.5 : 0}
								startAngle={90}
								stroke="none"
							>
								{hasData
									? slices.map((s) => <Cell fill={s.fill} key={s.key} />)
									: [<Cell fill="rgba(255,255,255,0.04)" key="empty" />]}
							</Pie>
						</PieChart>
					</ResponsiveContainer>
				</div>

				{/* Legend table. Asset / chain on the left, pct right-aligned.
				    Tabular numerics, hairline row separators. */}
				<ul className="flex min-w-0 flex-1 flex-col">
					{hasData ? (
						slices.map((s, i) => (
							<li
								className={cn(
									"flex items-center justify-between gap-2 py-1 font-mono text-[11px]",
									i > 0 ? "border-t border-[var(--border-soft)]" : "",
								)}
								key={s.key}
							>
								<span className="flex min-w-0 items-center gap-2">
									<span
										aria-hidden
										className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
										style={{ backgroundColor: s.fill }}
									/>
									<TokenIcon
										address={snapshot.holdings.find((h) => h.asset === s.label)?.contract ?? ""}
										chain={s.chain}
										size={12}
										symbol={s.label}
									/>
									<span className="truncate text-[var(--text-primary)]">{s.label}</span>
									<span className="truncate text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
										{s.sub}
									</span>
								</span>
								<span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
									{s.pct.toFixed(1)}%
								</span>
							</li>
						))
					) : (
						<li className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							no priced assets yet
						</li>
					)}
				</ul>
			</div>
		</Panel>
	);
}

export default HoldingsAllocation;
