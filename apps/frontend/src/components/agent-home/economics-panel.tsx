/**
 * EconomicsPanel. Single SurfaceCard that surfaces the live economic
 * shape of a wave-M+ launch:
 *
 *   - current market cap (chainlink-scaled USD from TreasuryLP)
 *   - tier ladder (existing TierLadder component, embedded)
 *   - tax split as a single horizontal stacked bar
 *     (platform / patron / agent share)
 *   - patron + platform bps as small mono labels
 *
 * Renders nothing useful for non-wave-M launches (returns a quiet "not a
 * wave-M launch" placeholder so we don't surprise legacy agents).
 *
 * Style discipline: variance 6 / motion 4 / density 4.
 * The stacked bar replaces a generic 3-card stat dump; it shows the same
 * information with more rhythm and less noise.
 */
"use client";

import { type Address, isAddress } from "viem";

import { TierLadder } from "@/components/post-launch/tier-ladder";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { cn } from "@/lib/utils";

export interface EconomicsPanelProps {
	launch: AgentLaunchByToken | null;
}

export default function EconomicsPanel({ launch }: EconomicsPanelProps) {
	if (!launch) {
		return (
			<SurfaceCard padding="lg" className="text-center">
				<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">
					economics unavailable for this agent
				</p>
				<p className="mt-1.5 text-xs text-white/40">
					this token predates the wave-M launch factory; live tier + tax data is not on-chain.
				</p>
			</SurfaceCard>
		);
	}

	const treasuryLp = launch.treasuryLp && isAddress(launch.treasuryLp) ? (launch.treasuryLp as Address) : undefined;
	const split = launch.taxSplit;

	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			{/* tier ladder is the visual anchor */}
			<div className="p-5 md:p-6">
				<TierLadder treasuryLp={treasuryLp} />
			</div>

			{/* tax split bar */}
			<div className="border-t border-white/[0.06] p-5 md:p-6">
				<div className="mb-3 flex items-center justify-between">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">tax split</span>
					{split ? (
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">per claim epoch</span>
					) : null}
				</div>
				{split ? <TaxSplitBar split={split} /> : <SplitUnavailable />}
			</div>
		</SurfaceCard>
	);
}

/**
 * Horizontal stacked bar. The three segments are sized by bps and labeled
 * inline; legend below. Replaces the generic 3-column 'platform / patron
 * / agent' stat block.
 */
function TaxSplitBar({ split }: { split: NonNullable<AgentLaunchByToken["taxSplit"]> }) {
	const total = Math.max(1, split.platformBps + split.patronBps + split.agentBps);
	const platformPct = (split.platformBps / total) * 100;
	const patronPct = (split.patronBps / total) * 100;
	const agentPct = (split.agentBps / total) * 100;

	return (
		<>
			<div
				className="flex h-3 w-full overflow-hidden rounded-sm border border-white/10 bg-[#0a0a0c]"
				role="img"
				aria-label={`tax split: platform ${pct(platformPct)}, patron ${pct(patronPct)}, agent ${pct(agentPct)}`}
			>
				<Seg width={platformPct} tone="bg-white/15" />
				<Seg width={patronPct} tone="bg-white/35" />
				<Seg width={agentPct} tone="bg-[#00ff87]/70" />
			</div>
			<div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
				<Legend swatch="bg-white/15" label="platform" value={bps(split.platformBps)} />
				<Legend swatch="bg-white/35" label="patron" value={bps(split.patronBps)} />
				<Legend swatch="bg-[#00ff87]/70" label="agent" value={bps(split.agentBps)} accent />
			</div>
		</>
	);
}

function Seg({ width, tone }: { width: number; tone: string }) {
	if (width <= 0) return null;
	return <span className={cn("h-full", tone)} style={{ width: `${width}%` }} />;
}

function Legend({
	swatch,
	label,
	value,
	accent,
}: {
	swatch: string;
	label: string;
	value: string;
	accent?: boolean;
}) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<span className={cn("h-1.5 w-3 shrink-0 rounded-[2px]", swatch)} />
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</span>
			<span className={cn("ml-auto font-mono tabular-nums text-[11px]", accent ? "text-[#00ff87]" : "text-white/75")}>
				{value}
			</span>
		</div>
	);
}

function SplitUnavailable() {
	return <p className="font-mono text-[11px] text-white/35">tax split metadata not yet on this launch row.</p>;
}

function bps(b: number): string {
	const pct = (b / 100).toFixed(b % 100 === 0 ? 0 : 1);
	return `${pct}%`;
}

function pct(n: number): string {
	return `${n.toFixed(0)}%`;
}
