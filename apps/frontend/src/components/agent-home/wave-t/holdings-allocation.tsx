/**
 * Holdings Allocation panel (Wave T worker B, sophistication pass 2026-05-22).
 *
 * Interactive, dense, monochrome composition view of the agent's NAV.
 *
 * Three view modes selectable via a tiny pill row in the header:
 *   - by asset   (default): one row per (chain, contract || asset)
 *   - by chain:  collapse all assets into per-chain totals
 *   - by wallet: surface the per-wallet NAV breakdown when present
 *
 * Donut interactions:
 *   - hover a slice: it grows (recharts <Sector activeShape>) and a
 *     custom tooltip surfaces asset / balance / USD value / pct of NAV
 *   - click a slice (in by-asset mode with wallet breakdowns present):
 *     opens an inline drilldown showing the wallet split
 *
 * Brand discipline: every slice is a tinted green. No sky, amber, violet,
 * pink, or red. Single accent only.
 */

"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";

import { cn } from "@/lib/utils";

import { formatCompactNum, formatCompactUsd } from "@/lib/wave-t/format";
import type { ChainHolding, HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Label, Panel, TokenIcon } from "./_primitives";

// Monochrome ramp anchored on --accent. Single-hue brand discipline:
// every slice is a tinted green at decreasing intensities.
const SLICE_OPACITIES = [1, 0.7, 0.5, 0.36, 0.24, 0.16, 0.1];

const CHAIN_KEY_TO_TOKEN_CHAIN: Record<string, TokenChain> = {
	bsc: "bsc",
	eth: "ethereum",
	arb: "ethereum",
	base: "base",
	op: "ethereum",
};

type ViewMode = "asset" | "chain" | "wallet";

type Slice = {
	key: string;
	label: string;
	sub: string;
	balance: number;
	valueUsd: number;
	pct: number;
	fill: string;
	chain: TokenChain;
	/** Source rows feeding this slice. Used to render the click drilldown. */
	sources: ChainHolding[];
};

function tintForIndex(i: number): string {
	const opacity = SLICE_OPACITIES[i] ?? 0.08;
	return `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, transparent)`;
}

function slicesByAsset(holdings: ChainHolding[], navUsd: number): Slice[] {
	const live = holdings.filter((h) => h.valueUsd > 0).sort((a, b) => b.valueUsd - a.valueUsd);
	return live.slice(0, 7).map((h, i) => ({
		key: `${h.chain}-${h.contract ?? h.asset}`,
		label: h.asset,
		sub: h.chainName.toLowerCase(),
		balance: h.balance,
		valueUsd: h.valueUsd,
		pct: navUsd > 0 ? (h.valueUsd / navUsd) * 100 : 0,
		fill: tintForIndex(i),
		chain: CHAIN_KEY_TO_TOKEN_CHAIN[h.chain] ?? "ethereum",
		sources: [h],
	}));
}

function slicesByChain(holdings: ChainHolding[], navUsd: number): Slice[] {
	const grouped = new Map<string, { chainName: string; valueUsd: number; rows: ChainHolding[] }>();
	for (const h of holdings) {
		if (h.valueUsd <= 0) continue;
		const existing = grouped.get(h.chain);
		if (existing) {
			existing.valueUsd += h.valueUsd;
			existing.rows.push(h);
		} else {
			grouped.set(h.chain, { chainName: h.chainName, valueUsd: h.valueUsd, rows: [h] });
		}
	}
	const sorted = Array.from(grouped.entries()).sort(([, a], [, b]) => b.valueUsd - a.valueUsd);
	return sorted.slice(0, 7).map(([chain, group], i) => ({
		key: `chain-${chain}`,
		label: group.chainName.toLowerCase(),
		sub: `${group.rows.length} ${group.rows.length === 1 ? "asset" : "assets"}`,
		balance: 0,
		valueUsd: group.valueUsd,
		pct: navUsd > 0 ? (group.valueUsd / navUsd) * 100 : 0,
		fill: tintForIndex(i),
		chain: CHAIN_KEY_TO_TOKEN_CHAIN[chain] ?? "ethereum",
		sources: group.rows,
	}));
}

function slicesByWallet(holdings: ChainHolding[], navUsd: number): Slice[] {
	// Aggregate by wallet role across every (chain, asset) row that
	// carries a wallets[] breakdown. When wallets are absent (legacy
	// burner stub), fall back to a single "burner" pseudo-bucket.
	const buckets = new Map<string, { label: string; valueUsd: number; rows: ChainHolding[] }>();
	let hasAnyBreakdown = false;
	for (const h of holdings) {
		if (h.valueUsd <= 0) continue;
		if (h.wallets && h.wallets.length > 0) {
			hasAnyBreakdown = true;
			for (const w of h.wallets) {
				const key = w.role || w.label || "unknown";
				const existing = buckets.get(key);
				if (existing) {
					existing.valueUsd += w.valueUsd;
					existing.rows.push(h);
				} else {
					buckets.set(key, { label: w.label || w.role, valueUsd: w.valueUsd, rows: [h] });
				}
			}
		}
	}
	if (!hasAnyBreakdown) {
		// Single-wallet fallback path. Surface one "burner" bucket so the
		// donut still renders something honest in this mode.
		const total = holdings.reduce((s, h) => s + Math.max(0, h.valueUsd), 0);
		if (total <= 0) return [];
		return [
			{
				key: "wallet-burner",
				label: "burner",
				sub: "single-wallet",
				balance: 0,
				valueUsd: total,
				pct: navUsd > 0 ? (total / navUsd) * 100 : 0,
				fill: tintForIndex(0),
				chain: "bsc",
				sources: holdings.filter((h) => h.valueUsd > 0),
			},
		];
	}
	const sorted = Array.from(buckets.entries()).sort(([, a], [, b]) => b.valueUsd - a.valueUsd);
	return sorted.slice(0, 7).map(([role, group], i) => ({
		key: `wallet-${role}`,
		label: group.label,
		sub: role.replace(/-/g, " "),
		balance: 0,
		valueUsd: group.valueUsd,
		pct: navUsd > 0 ? (group.valueUsd / navUsd) * 100 : 0,
		fill: tintForIndex(i),
		chain: "bsc",
		sources: group.rows,
	}));
}

function slicesFor(mode: ViewMode, holdings: ChainHolding[], navUsd: number): Slice[] {
	if (mode === "chain") return slicesByChain(holdings, navUsd);
	if (mode === "wallet") return slicesByWallet(holdings, navUsd);
	return slicesByAsset(holdings, navUsd);
}

type SectorShapeProps = {
	cx?: number;
	cy?: number;
	innerRadius?: number;
	outerRadius?: number;
	startAngle?: number;
	endAngle?: number;
	fill?: string;
	isActive?: boolean;
};

// Per-sector renderer. Recharts v3 wires the hovered slice's `isActive`
// prop here, so the active slice grows outward by 4px and inactive
// slices render at base radius. Replaces the deprecated activeShape +
// activeIndex pair from recharts v2.
function SliceShape(props: SectorShapeProps) {
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, isActive } = props;
	if (
		cx === undefined ||
		cy === undefined ||
		innerRadius === undefined ||
		outerRadius === undefined ||
		startAngle === undefined ||
		endAngle === undefined
	) {
		return null;
	}
	return (
		<Sector
			cx={cx}
			cy={cy}
			endAngle={endAngle}
			fill={fill}
			innerRadius={innerRadius}
			outerRadius={isActive ? outerRadius + 4 : outerRadius}
			startAngle={startAngle}
		/>
	);
}

export function HoldingsAllocation({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const [mode, setMode] = useState<ViewMode>("asset");
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const slices = useMemo(() => slicesFor(mode, snapshot.holdings, snapshot.navUsd), [mode, snapshot]);
	const hasData = slices.length > 0;
	const activeSlice = activeKey ? (slices.find((s) => s.key === activeKey) ?? null) : null;
	const expandedSlice = expandedKey ? (slices.find((s) => s.key === expandedKey) ?? null) : null;

	// Recharts wants at least one row; draw a faint ring when empty.
	const chartData = hasData ? slices.map((s) => ({ name: s.key, value: s.valueUsd })) : [{ name: "empty", value: 1 }];

	const counts = useMemo(() => {
		const live = snapshot.holdings.filter((h) => h.valueUsd > 0);
		const chains = new Set(live.map((h) => h.chain));
		const wallets = new Set<string>();
		for (const h of live) {
			if (h.wallets) for (const w of h.wallets) wallets.add(w.role || w.label);
		}
		return { assets: live.length, chains: chains.size, wallets: wallets.size };
	}, [snapshot]);

	const hasWalletBreakdown = counts.wallets > 0;

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<div className="flex items-center gap-1">
						<ViewPill active={mode === "asset"} label="asset" onClick={() => setMode("asset")} />
						<ViewPill active={mode === "chain"} label="chain" onClick={() => setMode("chain")} />
						{hasWalletBreakdown ? (
							<ViewPill active={mode === "wallet"} label="wallet" onClick={() => setMode("wallet")} />
						) : null}
					</div>
				}
			>
				holdings allocation
			</Label>

			<div className="flex flex-1 items-start gap-4">
				{/* Donut + center hover readout */}
				<div className="relative h-[112px] w-[112px] shrink-0">
					<ResponsiveContainer height="100%" width="100%">
						<PieChart>
							<Pie
								cx="50%"
								cy="50%"
								data={chartData}
								dataKey="value"
								endAngle={-270}
								innerRadius={38}
								isAnimationActive={false}
								onMouseEnter={(_, idx) => {
									const s = slices[idx];
									if (s) setActiveKey(s.key);
								}}
								onMouseLeave={() => setActiveKey(null)}
								outerRadius={52}
								paddingAngle={hasData && slices.length > 1 ? 1.5 : 0}
								shape={SliceShape as never}
								startAngle={90}
								stroke="none"
							>
								{hasData
									? slices.map((s) => <Cell fill={s.fill} key={s.key} style={{ cursor: "pointer" }} />)
									: [<Cell fill="rgba(255,255,255,0.04)" key="empty" />]}
							</Pie>
						</PieChart>
					</ResponsiveContainer>
					{/* Center hover readout: when hovering a slice, surface its
					    percentage. Otherwise show the asset count for the
					    current mode. */}
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
						<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							{activeSlice ? activeSlice.label.toLowerCase() : mode}
						</span>
						<span className="font-mono text-[13px] text-[var(--text-primary)] tabular-nums">
							{activeSlice ? `${activeSlice.pct.toFixed(1)}%` : countForMode(mode, counts)}
						</span>
					</div>
				</div>

				{/* Legend table */}
				<ul className="flex min-w-0 flex-1 flex-col">
					{hasData ? (
						slices.map((s, i) => {
							const isExpanded = expandedKey === s.key;
							const isActive = activeKey === s.key;
							const expandable = mode === "asset" && s.sources[0]?.wallets && s.sources[0].wallets.length > 1;
							return (
								<LegendRow
									key={s.key}
									slice={s}
									showTopBorder={i > 0}
									isActive={isActive}
									isExpanded={isExpanded}
									expandable={!!expandable}
									onEnter={() => setActiveKey(s.key)}
									onLeave={() => setActiveKey((cur) => (cur === s.key ? null : cur))}
									onToggle={() => (expandable ? setExpandedKey((cur) => (cur === s.key ? null : s.key)) : undefined)}
								/>
							);
						})
					) : (
						<li className="flex flex-col gap-1">
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
								no priced assets yet
							</span>
							<span className="font-mono text-[11px] leading-snug text-[var(--text-tertiary)]/70">
								agent-safe + agent-hot + patron wallets populate this view once funded
							</span>
						</li>
					)}
				</ul>
			</div>

			{/* Inline drilldown: per-wallet breakdown of the currently
			    expanded asset. Sits beneath the donut+legend row, hairline-
			    separated, monospaced. */}
			{expandedSlice?.sources[0]?.wallets && expandedSlice.sources[0].wallets.length > 1 ? (
				<div className="mt-3 border-t border-[var(--border-soft)] pt-3">
					<div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						<span>{expandedSlice.label.toLowerCase()} · per wallet</span>
						<button
							className="text-[var(--text-tertiary)] hover:text-[var(--accent)]"
							onClick={() => setExpandedKey(null)}
							type="button"
						>
							close
						</button>
					</div>
					<ul className="flex flex-col">
						{expandedSlice.sources[0].wallets.map((w, wi) => {
							const walletPct = expandedSlice.valueUsd > 0 ? (w.valueUsd / expandedSlice.valueUsd) * 100 : 0;
							return (
								<li
									className={cn(
										"flex items-center justify-between gap-2 py-1 font-mono text-[11px]",
										wi > 0 ? "border-t border-[var(--border-soft)]" : "",
									)}
									key={`${expandedSlice.key}-${w.role}-${wi}`}
								>
									<span className="flex items-center gap-2">
										<span className="rounded-sm border border-[var(--border-soft)] bg-white/[0.02] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
											{(w.role || w.label).replace(/-/g, " ")}
										</span>
										<span className="tabular-nums text-[var(--text-secondary)]">
											{formatCompactNum(w.balance)} {expandedSlice.label}
										</span>
									</span>
									<span className="flex items-center gap-2">
										<span className="tabular-nums text-[var(--text-secondary)]">{formatCompactUsd(w.valueUsd)}</span>
										<span className="w-10 text-right tabular-nums text-[var(--text-tertiary)]">
											{walletPct.toFixed(1)}%
										</span>
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			) : null}
		</Panel>
	);
}

// ── helpers ─────────────────────────────────────────────────────

function countForMode(mode: ViewMode, c: { assets: number; chains: number; wallets: number }): string {
	if (mode === "chain") return `${c.chains}`;
	if (mode === "wallet") return `${c.wallets}`;
	return `${c.assets}`;
}

function ViewPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors",
				active
					? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
					: "border-[var(--border-soft)] text-[var(--text-tertiary)] hover:border-[var(--border-mid)] hover:text-[var(--text-secondary)]",
			)}
		>
			{label}
		</button>
	);
}

function LegendRow({
	slice,
	showTopBorder,
	isActive,
	isExpanded,
	expandable,
	onEnter,
	onLeave,
	onToggle,
}: {
	slice: Slice;
	showTopBorder: boolean;
	isActive: boolean;
	isExpanded: boolean;
	expandable: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onToggle?: () => void;
}) {
	const rowStyle: CSSProperties = isActive ? { backgroundColor: "rgba(255,255,255,0.02)" } : {};
	const content = (
		<>
			<span className="flex min-w-0 items-center gap-2">
				<span
					aria-hidden
					className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
					style={{ backgroundColor: slice.fill }}
				/>
				<TokenIcon address={slice.sources[0]?.contract ?? ""} chain={slice.chain} size={12} symbol={slice.label} />
				<span className="truncate text-[var(--text-primary)]">{slice.label}</span>
				<span className="truncate text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{slice.sub}</span>
				{expandable ? (
					<span
						className={cn(
							"font-mono text-[9px] uppercase tracking-[0.16em] transition-colors",
							isExpanded ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]/70",
						)}
					>
						{isExpanded ? "−" : "+"}
					</span>
				) : null}
			</span>
			<span className="flex items-center gap-2">
				<span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
					{formatCompactUsd(slice.valueUsd)}
				</span>
				<span className="w-10 text-right font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
					{slice.pct.toFixed(1)}%
				</span>
			</span>
		</>
	);

	if (expandable && onToggle) {
		return (
			<li className={showTopBorder ? "border-t border-[var(--border-soft)]" : ""}>
				<button
					type="button"
					onClick={onToggle}
					onMouseEnter={onEnter}
					onMouseLeave={onLeave}
					className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-sm px-1 py-1 font-mono text-[11px] transition-colors"
					style={rowStyle}
				>
					{content}
				</button>
			</li>
		);
	}

	return (
		<li
			className={cn(
				"flex items-center justify-between gap-2 py-1 font-mono text-[11px] transition-colors",
				showTopBorder ? "border-t border-[var(--border-soft)]" : "",
			)}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			style={rowStyle}
		>
			{content}
		</li>
	);
}

export default HoldingsAllocation;
