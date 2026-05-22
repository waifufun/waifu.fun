/**
 * TaxStreamPanel - live view of the per-launch TaxSplitter.
 *
 * On wave-M launches, sell tax flows into a per-launch TaxSplitter that
 * partitions every `split()` call into platform / patron / agent shares
 * (default 10 / 25 / 65 bps).
 *
 * Surface includes:
 *   - splitter pending balance: BNB sitting in the splitter awaiting the
 *     next `split()` call. Anyone can poke this; UI links to bscscan.
 *   - agent share accrued: the AgentSafe's BNB balance, which is the
 *     cumulative agent portion received minus any spends the safe has
 *     authorized. Live readout from RPC.
 *   - configured split (bps): the 10/25/65 default surfaced explicitly so
 *     viewers understand the math.
 *   - **NEW**: lifetime cumulative platform / patron / agent totals,
 *     scanned from `Split()` events via direct RPC. Cached in
 *     localStorage so subsequent loads only fetch the incremental tail.
 *     Falls back to "next split shortly" copy when RPC is unreachable.
 *   - **NEW**: per-split mini-feed showing the most recent splits with
 *     bscscan tx links, so the page has life even when the splitter is
 *     between fills.
 *
 * Visual: SurfaceCard, hairline rows, font-mono micro-caps. No tables.
 */
"use client";

import { ExternalLink } from "lucide-react";
import { type Address, formatEther, isAddress } from "viem";
import { useBalance } from "wagmi";
import { bsc } from "wagmi/chains";

import { SurfaceCard } from "@/components/ui/surface-card";
import { type SplitEvent, useTaxSplitHistory } from "@/hooks/use-tax-split-history";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { cn } from "@/lib/utils";

export interface TaxStreamPanelProps {
	launch: AgentLaunchByToken | null;
}

const POLL_MS = 60_000;
/** Max rows to show in the per-split mini-feed (newest first). */
const FEED_LIMIT = 3;

function fmtBnb(wei: bigint): string {
	const v = Number(formatEther(wei));
	if (!Number.isFinite(v)) return "0.0000";
	if (v === 0) return "0.0000";
	if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
	return v.toFixed(4);
}

function bpsToPct(bps: number | null | undefined): string {
	if (typeof bps !== "number" || !Number.isFinite(bps)) return "--";
	return `${(bps / 100).toFixed(0)}%`;
}

/** Compact relative time: "2m ago", "3h ago", "1d ago". */
function relativeTime(timestampMs: number): string {
	if (!timestampMs) return "just now";
	const delta = Date.now() - timestampMs;
	if (delta < 0) return "just now";
	const s = Math.floor(delta / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}

export default function TaxStreamPanel({ launch }: TaxStreamPanelProps) {
	const taxSplitter = launch?.taxSplitter ?? null;
	const agentSafe = launch?.agentSafe ?? null;
	const split = launch?.taxSplit ?? null;
	const launchBlock = deriveLaunchBlock(launch);

	const splitterValid = !!taxSplitter && isAddress(taxSplitter);
	const safeValid = !!agentSafe && isAddress(agentSafe);

	const splitterBalance = useBalance({
		address: splitterValid ? (taxSplitter as Address) : undefined,
		chainId: bsc.id,
		query: { enabled: splitterValid, refetchInterval: POLL_MS },
	});

	const safeBalance = useBalance({
		address: safeValid ? (agentSafe as Address) : undefined,
		chainId: bsc.id,
		query: { enabled: safeValid, refetchInterval: POLL_MS },
	});

	// Lifetime cumulative: scan Split() events from the launch block. Cached
	// in localStorage; subsequent loads only re-scan from lastBlock+1.
	const history = useTaxSplitHistory(splitterValid ? (taxSplitter as string) : null, launchBlock);

	if (!splitterValid && !safeValid) {
		return (
			<SurfaceCard padding="md">
				<div className="font-mono text-[11px] text-white/40">tax routing not yet configured for this launch</div>
			</SurfaceCard>
		);
	}

	const splitterWei = splitterBalance.data?.value ?? 0n;
	const safeWei = safeBalance.data?.value ?? 0n;

	const hasLifetime = history.status === "ready" && history.totals.splitCount > 0;
	const recentSplits = history.splits.slice(0, FEED_LIMIT);

	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			<header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 md:px-6">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">tax stream</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
						{split
							? `${bpsToPct(split.platformBps)} platform · ${bpsToPct(split.patronBps)} patron · ${bpsToPct(split.agentBps)} agent`
							: "split metadata not on this launch row"}
					</span>
				</div>
				{splitterValid ? (
					<a
						href={`https://bscscan.com/address/${taxSplitter}`}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-[#00ff87] transition-colors"
						aria-label="open tax splitter on bscscan"
					>
						splitter
						<ExternalLink className="h-3 w-3" strokeWidth={1.5} />
					</a>
				) : null}
			</header>

			<div className="divide-y divide-white/[0.06]">
				<StreamStat
					label="splitter pending"
					hint="awaiting next split() · anyone can call it"
					value={splitterBalance.isLoading ? "…" : `${fmtBnb(splitterWei)} bnb`}
					tone={splitterWei > 0n ? "active" : "idle"}
				/>
				<StreamStat
					label="agent share accrued"
					hint="bnb held in agent safe (post-split)"
					value={safeBalance.isLoading ? "…" : `${fmtBnb(safeWei)} bnb`}
					tone={safeWei > 0n ? "active" : "idle"}
				/>
				{hasLifetime ? (
					<>
						<LifetimeRow
							label="lifetime distributed"
							hint={`${history.totals.splitCount} split${history.totals.splitCount === 1 ? "" : "s"} since launch`}
							value={`${fmtBnb(history.totals.totalWei)} bnb`}
						/>
						<LifetimeRow
							label="lifetime platform"
							hint={`${bpsToPct(split?.platformBps)} share`}
							value={`${fmtBnb(history.totals.platformWei)} bnb`}
							muted
						/>
						<LifetimeRow
							label="lifetime patron"
							hint={`${bpsToPct(split?.patronBps)} share · shadow hot`}
							value={`${fmtBnb(history.totals.patronWei)} bnb`}
							muted
						/>
						<LifetimeRow
							label="lifetime agent"
							hint={`${bpsToPct(split?.agentBps)} share · routed to safe`}
							value={`${fmtBnb(history.totals.agentWei)} bnb`}
							muted
						/>
					</>
				) : null}
			</div>

			{recentSplits.length > 0 ? (
				<div className="border-t border-white/[0.06] bg-[#06060a] px-5 py-3 md:px-6">
					<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">recent splits</div>
					<ul className="flex flex-col gap-2">
						{recentSplits.map((s) => (
							<li key={`${s.txHash}-${s.blockNumber}`}>
								<SplitRow event={s} />
							</li>
						))}
					</ul>
				</div>
			) : null}

			<footer className="border-t border-white/[0.06] bg-[#06060a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 md:px-6">
				{hasLifetime
					? `live readouts · lifetime via on-chain logs · scanned to block ${history.lastBlockScanned}`
					: history.status === "error"
						? "live readouts · lifetime history pending rpc"
						: history.status === "loading"
							? "live readouts · scanning split history…"
							: "live readouts · 60s refresh · next split shortly"}
			</footer>
		</SurfaceCard>
	);
}

function StreamStat({
	label,
	hint,
	value,
	tone,
}: {
	label: string;
	hint: string;
	value: string;
	tone: "active" | "idle";
}) {
	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 md:px-6">
			<div className="flex flex-col gap-0.5 min-w-0">
				<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</span>
				<span className="font-mono text-[10px] text-white/35">{hint}</span>
			</div>
			<span className={cn("font-mono text-[14px] tabular-nums", tone === "active" ? "text-white/90" : "text-white/55")}>
				{value}
			</span>
		</div>
	);
}

function LifetimeRow({
	label,
	hint,
	value,
	muted = false,
}: {
	label: string;
	hint: string;
	value: string;
	muted?: boolean;
}) {
	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5 md:px-6">
			<div className="flex flex-col gap-0.5 min-w-0">
				<span
					className={cn("font-mono text-[10px] uppercase tracking-[0.22em]", muted ? "text-white/35" : "text-white/55")}
				>
					{label}
				</span>
				<span className="font-mono text-[10px] text-white/30">{hint}</span>
			</div>
			<span className={cn("font-mono tabular-nums", muted ? "text-[12px] text-white/65" : "text-[14px] text-white/90")}>
				{value}
			</span>
		</div>
	);
}

function SplitRow({ event }: { event: SplitEvent }) {
	const total = event.platformAmt + event.patronAmt + event.agentAmt;
	return (
		<a
			href={`https://bscscan.com/tx/${event.txHash}`}
			target="_blank"
			rel="noreferrer"
			className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-sm border border-white/[0.06] bg-[#08080a] px-3 py-2 transition-colors hover:border-white/15"
		>
			<div className="flex flex-col gap-0.5 min-w-0">
				<span className="font-mono text-[11px] text-white/80">{fmtBnb(total)} bnb distributed</span>
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">
					{fmtBnb(event.platformAmt)} / {fmtBnb(event.patronAmt)} / {fmtBnb(event.agentAmt)}
				</span>
			</div>
			<span className="font-mono text-[10px] tabular-nums text-white/45">{relativeTime(event.timestampMs)}</span>
			<ExternalLink className="h-3 w-3 text-white/35" strokeWidth={1.5} />
		</a>
	);
}

/**
 * Pick a sane fromBlock for the Split-event scan.
 *
 * The launch row doesn't expose a launch-block field directly, but the
 * launch timestamp + a rough BSC blocktime (~3s) lets us compute a
 * conservative lower bound. We also accept the literal block via
 * launch metadata when present.
 */
function deriveLaunchBlock(launch: AgentLaunchByToken | null): number | null {
	if (!launch) return null;
	const metaBlock = (launch.metadata as Record<string, unknown> | undefined)?.launchBlock;
	if (typeof metaBlock === "number" && metaBlock > 0) return metaBlock;

	if (!launch.launchTimestamp) return null;
	// Linear interpolation anchored on the $WAIFU launch tx
	// (block 99_733_919 at ~2026-05-22 01:30 MDT). Off by ~1k blocks is
	// fine because Split() events between launch and first-split are zero.
	const BSC_ANCHOR_BLOCK = 99_733_919;
	const BSC_ANCHOR_TS_SEC = 1_747_883_580;
	const BSC_BLOCKTIME_SEC = 3;
	const deltaSec = launch.launchTimestamp - BSC_ANCHOR_TS_SEC;
	const estimated = BSC_ANCHOR_BLOCK + Math.floor(deltaSec / BSC_BLOCKTIME_SEC);
	return Math.max(0, estimated - 500);
}
