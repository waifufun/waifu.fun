/**
 * TaxStreamPanel - live view of the per-launch TaxSplitter.
 *
 * On wave-M launches, sell tax flows into a per-launch TaxSplitter that
 * partitions every `split()` call into platform / patron / agent shares
 * (default 10 / 25 / 65 bps).
 *
 * What we surface right now (purely from live RPC reads, no indexer
 * required):
 *   - splitter pending balance: BNB sitting in the splitter awaiting the
 *     next `split()` call. Anyone can poke this; UI links to bscscan.
 *   - agent share accrued: the AgentSafe's BNB balance, which is the
 *     cumulative agent portion received minus any spends the safe has
 *     authorized. Good honest proxy for "how much has the tax stream
 *     delivered to the agent so far" until a full event indexer ships.
 *   - configured split (bps): the 10/25/65 default surfaced explicitly so
 *     viewers understand the math.
 *
 * Why no lifetime/24h cumulative aggregate yet: BSC public RPCs cap
 * `eth_getLogs` at 10 blocks and we don't have a BscScan paid plan; the
 * indexer that would track `Split()` events lives behind a follow-up.
 * We surface the live numbers we DO have honestly rather than n/a-ing
 * out the whole panel.
 *
 * Visual: SurfaceCard, hairline rows, font-mono micro-caps. No tables.
 */
"use client";

import { ExternalLink } from "lucide-react";
import { type Address, formatEther, isAddress } from "viem";
import { useBalance } from "wagmi";
import { bsc } from "wagmi/chains";

import { SurfaceCard } from "@/components/ui/surface-card";
import { useTranslation } from "@/contexts/locale-context";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { cn } from "@/lib/utils";

export interface TaxStreamPanelProps {
	launch: AgentLaunchByToken | null;
}

const POLL_MS = 60_000;

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

export default function TaxStreamPanel({ launch }: TaxStreamPanelProps) {
	const { t } = useTranslation();
	const taxSplitter = launch?.taxSplitter ?? null;
	const agentSafe = launch?.agentSafe ?? null;
	const split = launch?.taxSplit ?? null;

	const splitterValid = !!taxSplitter && isAddress(taxSplitter);
	const safeValid = !!agentSafe && isAddress(agentSafe);

	// Splitter pending balance: anyone can call split() to release it.
	const splitterBalance = useBalance({
		address: splitterValid ? (taxSplitter as Address) : undefined,
		chainId: bsc.id,
		query: { enabled: splitterValid, refetchInterval: POLL_MS },
	});

	// AgentSafe BNB balance: proxy for cumulative agent share accrued.
	// This isn't strictly lifetime (the safe could spend funds, lowering
	// the number) but on day-zero with no spends it's exact, and over
	// time the trend remains a useful "agent treasury liquid bnb" line.
	const safeBalance = useBalance({
		address: safeValid ? (agentSafe as Address) : undefined,
		chainId: bsc.id,
		query: { enabled: safeValid, refetchInterval: POLL_MS },
	});

	if (!splitterValid && !safeValid) {
		return (
			<SurfaceCard padding="md">
				<div className="font-mono text-[11px] text-white/40">{t("agent.taxStream.notConfigured")}</div>
			</SurfaceCard>
		);
	}

	const splitterWei = splitterBalance.data?.value ?? 0n;
	const safeWei = safeBalance.data?.value ?? 0n;

	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			<header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 md:px-6">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
						{t("agent.taxStream.label")}
					</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
						{split
							? t("agent.taxStream.splitTemplate", {
									platform: bpsToPct(split.platformBps),
									patron: bpsToPct(split.patronBps),
									agent: bpsToPct(split.agentBps),
								})
							: t("agent.taxStream.splitMetadataMissing")}
					</span>
				</div>
				{splitterValid ? (
					<a
						href={`https://bscscan.com/address/${taxSplitter}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-[#00ff87] transition-colors"
						aria-label={t("agent.taxStream.openSplitterAria")}
					>
						{t("agent.taxStream.splitterLabel")}
						<ExternalLink className="h-3 w-3" strokeWidth={1.5} />
					</a>
				) : null}
			</header>

			<div className="divide-y divide-white/[0.06]">
				<StreamStat
					label={t("agent.taxStream.splitterPending")}
					hint={t("agent.taxStream.splitterPendingHint")}
					value={splitterBalance.isLoading ? "…" : `${fmtBnb(splitterWei)} bnb`}
					tone={splitterWei > 0n ? "active" : "idle"}
				/>
				<StreamStat
					label={t("agent.taxStream.agentShareAccrued")}
					hint={t("agent.taxStream.agentShareHint")}
					value={safeBalance.isLoading ? "…" : `${fmtBnb(safeWei)} bnb`}
					tone={safeWei > 0n ? "active" : "idle"}
				/>
			</div>

			<footer className="border-t border-white/[0.06] bg-[#06060a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 md:px-6">
				{t("agent.taxStream.footer")}
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
