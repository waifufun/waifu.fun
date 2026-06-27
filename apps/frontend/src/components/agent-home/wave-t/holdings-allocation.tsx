/**
 * Treasury cockpit (Wave T, holdings redesign 2026-06-16).
 *
 * Two surfaces behind one segmented control in the header, sharing a single
 * NAV hero so the panel reads as deliberate as the active-positions panel
 * next to it (the established gold standard on this page):
 *
 *   - wallets (default): a role-grouped wallet ledger. one row per real
 *     on-chain wallet, grouped under its role (agent-safe / agent-hot /
 *     patron / venue-bridge). each row leads with the wallet's lead-asset
 *     logo + label + chain badge + usd value on ONE scannable line, then a
 *     single-green composition bar, then a quiet meta line (venue tag,
 *     asset summary, copy-address, share of nav). this is the "where is the
 *     money + what's it doing" view a degen scans first.
 *
 *   - allocation: the donut. a clean ring with a real asset/chain/wallet
 *     segmented toggle and a legend that carries role/chain context. slices
 *     are a single-hue green ramp (brand discipline, no second accent).
 *
 * Live: a pulse dot rides the header (holdings repoll every 10s) and the
 * NAV value tickers green/red on change. honest empty states in wave-t
 * grammar.
 *
 * Brand discipline (.impeccable.md): DENSE but readable, hairlines not card
 * soup, mono tabular nums, single green accent. no sky, amber, violet, pink.
 * every tinted swatch is a green at decreasing opacity. no hex outside
 * THEME_TOKENS.
 *
 * Mobile: the NAV hero stat strip wraps 2-up, the donut + legend stack
 * vertically below ~420px so nothing overflows at 375px.
 */

"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";

import { cn } from "@/lib/utils";

import { formatCompactUsd } from "@/lib/wave-t/format";
import type { ChainHolding, HoldingsSnapshot, RoleLine, WalletLine } from "@/lib/wave-t/holdings";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Label, Panel, Pulse, TokenIcon } from "./_primitives";

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

// Short, scannable chain labels for the wallet-ledger badges. CAPS per the
// copy rule for chain tags ([BNB CHAIN] style); kept to 3-4 glyphs.
const CHAIN_BADGE: Record<string, string> = {
	bsc: "BSC",
	eth: "ETH",
	arb: "ARB",
	base: "BASE",
	op: "OP",
};

// Human label for each wallet role. The API role strings are stable; this
// keeps the copy lowercase + tight per the wave-t voice.
const ROLE_LABEL: Record<string, string> = {
	"agent-safe": "agent safe",
	"agent-hot": "agent hot",
	patron: "patron",
	"venue-bridge": "venue bridge",
};

// One-line role descriptors. Tells a viewer what the bucket is *for* without
// a paragraph. Lowercase, no marketing-ese.
const ROLE_HINT: Record<string, string> = {
	"agent-safe": "cold treasury",
	"agent-hot": "live trading",
	patron: "sponsor stake",
	"venue-bridge": "venue collateral",
};

type Surface = "wallets" | "allocation";
type ViewMode = "asset" | "chain" | "wallet";

function tintForIndex(i: number): string {
	const opacity = SLICE_OPACITIES[i] ?? 0.08;
	return `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, transparent)`;
}

function roleLabelOf(role: string): string {
	return ROLE_LABEL[role] ?? role.replace(/-/g, " ");
}

// ── ticking nav value (subtle reprice motion) ──────────────────

function useTickFlash(value: number): "up" | "down" | null {
	const prev = useRef(value);
	const [dir, setDir] = useState<"up" | "down" | null>(null);
	useEffect(() => {
		const prior = prev.current;
		prev.current = value;
		// No change: nothing to flash, leave any settled state alone.
		if (value === prior) return;
		setDir(value > prior ? "up" : "down");
		const t = setTimeout(() => setDir(null), 700);
		return () => clearTimeout(t);
	}, [value]);
	return dir;
}

// ── root ────────────────────────────────────────────────────────

export function HoldingsAllocation({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const roles = snapshot.roles ?? [];
	const hasLedger = roles.length > 0;
	// Default to the wallets ledger when it carries data; fall back to the
	// donut for legacy single-wallet snapshots that have no role breakdown.
	const [surface, setSurface] = useState<Surface>(hasLedger ? "wallets" : "allocation");
	// Track whether the viewer has manually chosen a surface. The agent page
	// is static-exported: the SSG seed often has no `roles` yet, so the
	// initializer above picks "allocation". Once useLiveHoldings polls an
	// aggregated snapshot the ledger appears, and we promote it to the
	// default, but only while the viewer has not clicked a tab themselves.
	const userPicked = useRef(false);
	const pick = (s: Surface) => {
		userPicked.current = true;
		setSurface(s);
	};
	useEffect(() => {
		if (!userPicked.current && hasLedger && surface === "allocation") setSurface("wallets");
	}, [hasLedger, surface]);

	const flash = useTickFlash(snapshot.navUsd);
	const reduce = useReducedMotion();

	const walletCount = useMemo(() => roles.reduce((n, r) => n + r.wallets.length, 0), [roles]);
	const topChainTag = useMemo(() => dominantChainTag(snapshot), [snapshot]);

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<div className="flex items-center gap-1">
						{hasLedger ? (
							<SurfacePill active={surface === "wallets"} label="wallets" onClick={() => pick("wallets")} />
						) : null}
						<SurfacePill active={surface === "allocation"} label="allocation" onClick={() => pick("allocation")} />
					</div>
				}
			>
				<Pulse />
				<span>treasury</span>
			</Label>

			{/* NAV hero. A bordered stat strip, cohesive with the account-health
			    hero in active-positions: NAV is the lead number, then the
			    structural facts (roles, wallets, top chain) a viewer scans next. */}
			<div className="mb-4 rounded-md border border-[var(--border-soft)] bg-white/[0.015] p-3.5">
				<div className="flex flex-col gap-1">
					<span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						net asset value
					</span>
					<span
						className={cn(
							"font-mono text-[24px] leading-none tabular-nums transition-colors duration-500",
							flash === "up"
								? "text-[var(--positive)]"
								: flash === "down"
									? "text-[var(--negative)]"
									: "text-[var(--text-primary)]",
						)}
					>
						{formatCompactUsd(snapshot.navUsd)}
					</span>
				</div>

				{hasLedger ? (
					<div className="mt-3.5 grid grid-cols-3 gap-x-3 border-t border-[var(--border-soft)] pt-3">
						<HeroStat label="roles" value={`${roles.length}`} />
						<HeroStat label="wallets" value={`${walletCount}`} />
						<HeroStat label="top chain" value={topChainTag ?? "·"} />
					</div>
				) : null}
			</div>

			<div className="flex-1">
				<AnimatePresence initial={false} mode="wait">
					{surface === "wallets" && hasLedger ? (
						<motion.div
							key="wallets"
							initial={reduce ? false : { opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
							transition={{ duration: 0.15 }}
						>
							<WalletLedger roles={roles} navUsd={snapshot.navUsd} />
						</motion.div>
					) : (
						<motion.div
							key="allocation"
							initial={reduce ? false : { opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
							transition={{ duration: 0.15 }}
						>
							<AllocationDonut snapshot={snapshot} />
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</Panel>
	);
}

// Most-valuable chain across priced holdings, as a short CAPS tag for the
// hero strip. Falls back to null (rendered as a middot) when nothing priced.
function dominantChainTag(snapshot: HoldingsSnapshot): string | null {
	const byChain = new Map<string, number>();
	for (const h of snapshot.holdings) {
		if (h.valueUsd <= 0) continue;
		byChain.set(h.chain, (byChain.get(h.chain) ?? 0) + h.valueUsd);
	}
	let bestKey: string | null = null;
	let bestVal = 0;
	for (const [k, v] of byChain) {
		if (v > bestVal) {
			bestVal = v;
			bestKey = k;
		}
	}
	if (!bestKey) return null;
	return CHAIN_BADGE[bestKey] ?? bestKey.toUpperCase();
}

function HeroStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{label}</span>
			<span className="font-mono text-[14px] leading-none tabular-nums text-[var(--text-primary)]">{value}</span>
		</div>
	);
}

// ── wallet ledger ──────────────────────────────────────────────

function WalletLedger({ roles, navUsd }: { roles: RoleLine[]; navUsd: number }) {
	return (
		<ul className="flex flex-col gap-4">
			{roles.map((role) => (
				<RoleGroup key={role.role} role={role} navUsd={navUsd} />
			))}
		</ul>
	);
}

function RoleGroup({ role, navUsd }: { role: RoleLine; navUsd: number }) {
	const sharePct = navUsd > 0 ? (role.valueUsd / navUsd) * 100 : 0;
	const hint = ROLE_HINT[role.role];
	return (
		<li>
			{/* Role header: name + what-it's-for hint on the left, total + share
			    on the right. The wallets nest beneath in a bordered group. */}
			<div className="mb-2 flex items-baseline justify-between gap-2">
				<div className="flex min-w-0 items-baseline gap-2">
					<span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
						{roleLabelOf(role.role)}
					</span>
					{hint ? (
						<span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
							{hint}
						</span>
					) : null}
				</div>
				<div className="flex shrink-0 items-baseline gap-2">
					<span className="font-mono text-[12px] tabular-nums text-[var(--text-primary)]">
						{formatCompactUsd(role.valueUsd)}
					</span>
					<span className="w-11 text-right font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
						{sharePct.toFixed(1)}%
					</span>
				</div>
			</div>
			<div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-white/[0.012]">
				{role.wallets.map((w, i) => (
					<WalletRow
						key={`${role.role}-${w.address || w.label}-${i}`}
						wallet={w}
						navUsd={navUsd}
						showTopBorder={i > 0}
					/>
				))}
			</div>
		</li>
	);
}

function WalletRow({
	wallet,
	navUsd,
	showTopBorder,
}: {
	wallet: WalletLine;
	navUsd: number;
	showTopBorder: boolean;
}) {
	const sharePct = navUsd > 0 ? (wallet.valueUsd / navUsd) * 100 : 0;
	const chainTag = CHAIN_BADGE[wallet.chain] ?? wallet.chainName.toUpperCase();
	const top = wallet.assets[0];
	const topChain = CHAIN_KEY_TO_TOKEN_CHAIN[wallet.chain] ?? "ethereum";

	return (
		<div
			className={cn(
				"flex flex-col gap-2.5 px-3 py-3 transition-colors hover:bg-white/[0.02]",
				showTopBorder ? "border-t border-[var(--border-soft)]" : "",
			)}
		>
			{/* Primary line: lead-asset logo + label + chain badge on the left,
			    the wallet's usd value on the right. The single line a viewer
			    reads to place the wallet (WAIFU-heavy safe vs BNB hot). */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					{top ? (
						<TokenIcon address="" chain={topChain} size={18} symbol={top.asset} />
					) : (
						<span className="inline-block h-[18px] w-[18px] shrink-0 rounded-full bg-white/[0.04]" />
					)}
					<span className="truncate font-mono text-[12px] text-[var(--text-primary)]">{wallet.label}</span>
					<ChainBadge tag={chainTag} />
				</div>
				<span className="shrink-0 font-mono text-[13px] tabular-nums text-[var(--text-primary)]">
					{formatCompactUsd(wallet.valueUsd)}
				</span>
			</div>

			{/* Composition bar: single-green stacked share of this wallet across
			    its assets. Pure brand-hue, no second color. */}
			<CompositionBar assets={wallet.assets} />

			{/* Meta line: venue tag + asset summary on the left, copy-address +
			    share-of-nav on the right. Quiet, tertiary, never competes with
			    the value above. */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{wallet.venue ? (
						<span className="rounded-sm border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--accent)]">
							{wallet.venue.toLowerCase()}
						</span>
					) : null}
					<AssetSummary assets={wallet.assets} />
				</div>
				<div className="flex shrink-0 items-center gap-2.5">
					{wallet.address ? <CopyAddress address={wallet.address} /> : null}
					<span className="w-10 text-right font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
						{sharePct.toFixed(1)}%
					</span>
				</div>
			</div>
		</div>
	);
}

function CompositionBar({ assets }: { assets: WalletLine["assets"] }) {
	const total = assets.reduce((s, a) => s + Math.max(0, a.valueUsd), 0);
	if (total <= 0) return <div className="h-1.5 w-full rounded-full bg-white/[0.05]" />;
	const top = assets.slice(0, 5);
	return (
		<div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.04]">
			{top.map((a, i) => {
				const pct = (a.valueUsd / total) * 100;
				return (
					<span
						key={a.asset}
						className="h-full first:rounded-l-full last:rounded-r-full"
						style={{ width: `${pct}%`, backgroundColor: tintForIndex(i) }}
						title={`${a.asset} ${formatCompactUsd(a.valueUsd)}`}
					/>
				);
			})}
		</div>
	);
}

function AssetSummary({ assets }: { assets: WalletLine["assets"] }) {
	if (assets.length === 0) return null;
	const top = assets.slice(0, 2).map((a) => a.asset.toUpperCase());
	const rest = assets.length - top.length;
	return (
		<span className="truncate font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
			{top.join(" · ")}
			{rest > 0 ? ` +${rest}` : ""}
		</span>
	);
}

function ChainBadge({ tag }: { tag: string }) {
	return (
		<span className="shrink-0 rounded-sm border border-[var(--border-mid)] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
			{tag}
		</span>
	);
}

function CopyAddress({ address }: { address: string }) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 900);
		return () => clearTimeout(t);
	}, [copied]);
	const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				navigator.clipboard?.writeText(address).then(
					() => setCopied(true),
					() => undefined,
				);
			}}
			title={copied ? "copied" : address}
			className={cn(
				"inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-[9.5px] tabular-nums transition-colors",
				copied ? "text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
			)}
		>
			<span>{short}</span>
			{copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5 opacity-60" />}
		</button>
	);
}

// ── allocation donut ───────────────────────────────────────────

type Slice = {
	key: string;
	label: string;
	sub: string;
	balance: number;
	valueUsd: number;
	pct: number;
	fill: string;
	chain: TokenChain;
	sources: ChainHolding[];
};

function slicesByAsset(holdings: ChainHolding[], navUsd: number): Slice[] {
	const live = holdings.filter((h) => h.valueUsd > 0).sort((a, b) => b.valueUsd - a.valueUsd);
	return live.slice(0, 7).map((h, i) => ({
		key: `${h.chain}-${h.contract ?? h.asset}`,
		label: h.asset,
		sub: (h.displayVenue ?? h.chainName).toLowerCase(),
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
	return sorted.slice(0, 7).map(([chain, group], i) => {
		const venues = new Set(group.rows.map((r) => r.displayVenue).filter(Boolean));
		const label = venues.size === 1 ? Array.from(venues)[0]!.toLowerCase() : group.chainName.toLowerCase();
		return {
			key: `chain-${chain}`,
			label,
			sub: `${group.rows.length} ${group.rows.length === 1 ? "asset" : "assets"}`,
			balance: 0,
			valueUsd: group.valueUsd,
			pct: navUsd > 0 ? (group.valueUsd / navUsd) * 100 : 0,
			fill: tintForIndex(i),
			chain: CHAIN_KEY_TO_TOKEN_CHAIN[chain] ?? "ethereum",
			sources: group.rows,
		};
	});
}

function slicesByWallet(holdings: ChainHolding[], navUsd: number): Slice[] {
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

function AllocationDonut({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const [mode, setMode] = useState<ViewMode>("asset");
	const [activeKey, setActiveKey] = useState<string | null>(null);

	const slices = useMemo(() => slicesFor(mode, snapshot.holdings, snapshot.navUsd), [mode, snapshot]);
	const hasData = slices.length > 0;
	const activeSlice = activeKey ? (slices.find((s) => s.key === activeKey) ?? null) : null;

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
		<div className="flex flex-col">
			{/* asset / chain / wallet segmented control */}
			<div className="mb-4 flex justify-end">
				<Segmented
					options={
						hasWalletBreakdown
							? [
									{ key: "asset", label: "asset" },
									{ key: "chain", label: "chain" },
									{ key: "wallet", label: "wallet" },
								]
							: [
									{ key: "asset", label: "asset" },
									{ key: "chain", label: "chain" },
								]
					}
					value={mode}
					onChange={(k) => setMode(k as ViewMode)}
				/>
			</div>

			{/* Donut + legend. Stacks vertically below ~420px (sm) so the 132px
			    ring + the legend never cramp at 375px; side-by-side on wider. */}
			<div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-5">
				<div className="relative h-[132px] w-[132px] shrink-0">
					<ResponsiveContainer height="100%" width="100%">
						<PieChart>
							<Pie
								cx="50%"
								cy="50%"
								data={chartData}
								dataKey="value"
								endAngle={-270}
								innerRadius={46}
								isAnimationActive={false}
								onMouseEnter={(_, idx) => {
									const s = slices[idx];
									if (s) setActiveKey(s.key);
								}}
								onMouseLeave={() => setActiveKey(null)}
								outerRadius={62}
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
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
						<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							{activeSlice ? activeSlice.label.toLowerCase() : mode}
						</span>
						<span className="mt-0.5 font-mono text-[16px] leading-none text-[var(--text-primary)] tabular-nums">
							{activeSlice ? `${activeSlice.pct.toFixed(1)}%` : countForMode(mode, counts)}
						</span>
						{!activeSlice ? (
							<span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]/70">
								{mode === "asset" ? "assets" : mode === "chain" ? "chains" : "wallets"}
							</span>
						) : null}
					</div>
				</div>

				<ul className="flex w-full min-w-0 flex-1 flex-col">
					{hasData ? (
						slices.map((s, i) => (
							<LegendRow
								key={s.key}
								slice={s}
								showTopBorder={i > 0}
								isActive={activeKey === s.key}
								onEnter={() => setActiveKey(s.key)}
								onLeave={() => setActiveKey((cur) => (cur === s.key ? null : cur))}
							/>
						))
					) : (
						<li className="flex flex-col gap-1.5">
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
		</div>
	);
}

// ── shared controls ────────────────────────────────────────────

function SurfacePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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

/**
 * Real segmented control: a single bordered track with a green pill that
 * slides under the active option (framer-motion layoutId). Replaces the
 * loose pill row so the asset/chain/wallet toggle reads as one control.
 */
function Segmented({
	options,
	value,
	onChange,
}: {
	options: { key: string; label: string }[];
	value: string;
	onChange: (key: string) => void;
}) {
	return (
		<div className="inline-flex items-center rounded-md border border-[var(--border-soft)] bg-white/[0.015] p-0.5">
			{options.map((o) => {
				const active = o.key === value;
				return (
					<button
						key={o.key}
						type="button"
						onClick={() => onChange(o.key)}
						className={cn(
							"relative rounded-sm px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors",
							active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
						)}
					>
						{active ? (
							<motion.span
								layoutId="alloc-segment"
								className="absolute inset-0 rounded-sm border border-[var(--accent)]/25 bg-[var(--accent-soft)]"
								transition={{ type: "spring", stiffness: 500, damping: 40 }}
							/>
						) : null}
						<span className="relative">{o.label}</span>
					</button>
				);
			})}
		</div>
	);
}

function countForMode(mode: ViewMode, c: { assets: number; chains: number; wallets: number }): string {
	if (mode === "chain") return `${c.chains}`;
	if (mode === "wallet") return `${c.wallets}`;
	return `${c.assets}`;
}

function LegendRow({
	slice,
	showTopBorder,
	isActive,
	onEnter,
	onLeave,
}: {
	slice: Slice;
	showTopBorder: boolean;
	isActive: boolean;
	onEnter: () => void;
	onLeave: () => void;
}) {
	const rowStyle: CSSProperties = isActive ? { backgroundColor: "rgba(255,255,255,0.02)" } : {};
	return (
		<li
			className={cn(
				"-mx-1 flex items-center justify-between gap-2 rounded-sm px-1 py-2 font-mono text-[11px] transition-colors",
				showTopBorder ? "border-t border-[var(--border-soft)]" : "",
			)}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			style={rowStyle}
		>
			<span className="flex min-w-0 items-center gap-2">
				<span
					aria-hidden
					className="inline-block h-2 w-2 shrink-0 rounded-full"
					style={{ backgroundColor: slice.fill }}
				/>
				<TokenIcon address={slice.sources[0]?.contract ?? ""} chain={slice.chain} size={15} symbol={slice.label} />
				<span className="truncate text-[12px] text-[var(--text-primary)]">{slice.label}</span>
				<span className="truncate text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{slice.sub}</span>
			</span>
			<span className="flex shrink-0 items-center gap-3">
				<span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
					{formatCompactUsd(slice.valueUsd)}
				</span>
				<span className="w-11 text-right font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
					{slice.pct.toFixed(1)}%
				</span>
			</span>
		</li>
	);
}

export default HoldingsAllocation;
