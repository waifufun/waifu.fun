/**
 * Tokenomics panel.
 *
 * Replaces the old one-line "thesis" blurb with the real numbers a degen
 * actually scans: how much supply got burned, the live distribution, the
 * treasury behind the token, and the tax stream split that funds the agent.
 *
 * Every figure is real or an honest empty state:
 *   - supply + burned come from on-chain reads (totalSupply, balanceOf the
 *     dead address) wired through fetchTokenMetrics. no burn -> burned row
 *     reads "none burned", never a fake number.
 *   - treasury is the live aggregated nav (or agent-safe fallback). null ->
 *     "no treasury data".
 *   - market cap / holders come from the dex + indexer. zero/absent ->
 *     honest empty copy, never a fabricated zero dressed as data.
 *   - tax + distribution are the bonding-curve / tax-stream contract
 *     parameters. if those move, edit the bps props at the call site.
 *
 * Single accent green, mono numbers, wave-t primitives only. No em-dashes.
 */

"use client";

import { formatCompactNum, formatCompactUsd } from "@/lib/wave-t/format";
import { Hairline, Label, Panel } from "./_primitives";

function humanizeSupply(raw: bigint, decimals: number): number | null {
	if (raw <= 0n) return null;
	const denom = 10 ** decimals;
	const n = Number(raw) / denom;
	return Number.isFinite(n) ? n : null;
}

/** Distribution segment for the tax-stream split bar. */
type Segment = { key: string; label: string; pct: number };

export function TokenomicsPanel({
	token,
	treasuryUsd,
	taxBuyBps = 300,
	taxSellBps = 300,
	agentShareBps = 6500,
	patronShareBps = 2500,
	platformShareBps = 1000,
}: {
	token: {
		symbol: string;
		priceUsd: number;
		marketCap: number;
		holders: number;
		totalSupply: bigint;
		burnedSupply: bigint;
		decimals: number;
	};
	treasuryUsd?: number | null;
	taxBuyBps?: number;
	taxSellBps?: number;
	agentShareBps?: number;
	patronShareBps?: number;
	platformShareBps?: number;
}) {
	const ticker = token.symbol ? token.symbol.toUpperCase() : "TOKEN";
	const supply = humanizeSupply(token.totalSupply, token.decimals);
	const burned = humanizeSupply(token.burnedSupply, token.decimals);
	const burnedPct = supply && burned ? (burned / supply) * 100 : null;
	const circulating = supply !== null ? supply - (burned ?? 0) : null;

	const hasMarketCap = Number.isFinite(token.marketCap) && token.marketCap > 0;
	const hasHolders = Number.isFinite(token.holders) && token.holders > 0;
	const hasTreasury = typeof treasuryUsd === "number" && treasuryUsd > 0;

	const taxBuyPct = (taxBuyBps / 100).toFixed(0);
	const taxSellPct = (taxSellBps / 100).toFixed(0);

	const segments: Segment[] = [
		{ key: "agent", label: "agent treasury", pct: agentShareBps / 100 },
		{ key: "patron", label: "patron", pct: patronShareBps / 100 },
		{ key: "platform", label: "platform", pct: platformShareBps / 100 },
	];

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						tax {taxBuyPct}/{taxSellPct}
					</span>
				}
			>
				tokenomics
			</Label>

			{/* Supply + burn: the headline. Burned is the loudest number on
			    the panel when a burn exists, demoted to honest copy when not. */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
				<div className="flex flex-col gap-3">
					<div className="flex items-end justify-between gap-3">
						<div className="flex flex-col gap-1">
							<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
								burned
							</span>
							{burned !== null ? (
								<span className="font-mono text-[24px] leading-none text-[var(--accent)] tabular-nums">
									{formatCompactNum(burned)}
									<span className="ml-1 text-[12px] text-[var(--text-tertiary)]">{ticker}</span>
								</span>
							) : (
								<span className="font-mono text-[13px] text-[var(--text-secondary)]">none burned</span>
							)}
						</div>
						{burnedPct !== null ? (
							<span className="font-mono text-[13px] text-[var(--accent)] tabular-nums">{burnedPct.toFixed(1)}%</span>
						) : null}
					</div>

					{/* Burned vs circulating bar. Renders only with real supply. */}
					{supply !== null && burnedPct !== null ? (
						<div className="flex flex-col gap-1.5">
							<div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
								<div
									className="h-full rounded-l-full bg-[var(--accent)]"
									style={{ width: `${Math.min(100, burnedPct)}%` }}
								/>
							</div>
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
								<span>burned {burnedPct.toFixed(1)}%</span>
								<span className="text-[var(--text-secondary)] tabular-nums">
									{circulating !== null ? `${formatCompactNum(circulating)} circ.` : null}
								</span>
							</div>
						</div>
					) : null}
				</div>

				{/* Supply / mcap / treasury / holders grid. */}
				<div className="grid grid-cols-2 gap-x-4 gap-y-3">
					<Metric
						label="total supply"
						value={supply !== null ? formatCompactNum(supply) : "no data yet"}
						muted={supply === null}
					/>
					<Metric
						label="market cap"
						value={hasMarketCap ? formatCompactUsd(token.marketCap) : "no data yet"}
						muted={!hasMarketCap}
					/>
					<Metric
						label="treasury"
						value={hasTreasury ? formatCompactUsd(treasuryUsd as number) : "no treasury data"}
						muted={!hasTreasury}
						tone={hasTreasury ? "accent" : "muted"}
					/>
					<Metric
						label="holders"
						value={hasHolders ? token.holders.toLocaleString("en-US") : "waiting on indexer"}
						muted={!hasHolders}
					/>
				</div>
			</div>

			<Hairline className="my-4" />

			{/* Tax stream distribution. The split that turns trades into agent
			    runway, presented as a single weighted bar instead of a hollow
			    one-liner. */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					<span>tax stream split</span>
					<span className="text-[var(--text-secondary)]">
						{taxBuyPct}% buy / {taxSellPct}% sell
					</span>
				</div>
				<div className="flex h-2 w-full overflow-hidden rounded-full">
					{segments.map((s, i) => (
						<div
							key={s.key}
							className="h-full"
							style={{
								width: `${s.pct}%`,
								backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(100 - i * 32)}%, transparent)`,
							}}
						/>
					))}
				</div>
				<ul className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5">
					{segments.map((s, i) => (
						<li key={s.key} className="flex items-center gap-1.5 font-mono text-[10px]">
							<span
								aria-hidden
								className="inline-block h-1.5 w-1.5 rounded-full"
								style={{
									backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(100 - i * 32)}%, transparent)`,
								}}
							/>
							<span className="text-[var(--text-secondary)]">{s.label}</span>
							<span className="text-[var(--text-primary)] tabular-nums">{s.pct.toFixed(0)}%</span>
						</li>
					))}
				</ul>
			</div>
		</Panel>
	);
}

function Metric({
	label,
	value,
	muted = false,
	tone = "default",
}: {
	label: string;
	value: string;
	muted?: boolean;
	tone?: "default" | "accent" | "muted";
}) {
	const valueCls =
		tone === "accent" && !muted
			? "text-[var(--accent)]"
			: muted
				? "text-[var(--text-secondary)]"
				: "text-[var(--text-primary)]";
	return (
		<div className="flex flex-col gap-0.5">
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{label}</span>
			<span className={`font-mono text-[13px] tabular-nums ${valueCls}`}>{value}</span>
		</div>
	);
}

export default TokenomicsPanel;
