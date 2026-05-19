/**
 * AgentHeroV2. The premium hero for the wave-M+ agent page.
 *
 * Layout (lg+): asymmetric 5/7 split. Poster image on the left, identity
 * stack on the right. On mobile it collapses to a single column with the
 * poster on top.
 *
 * What's surfaced:
 *   - large image, framed (inner ring + tinted shadow) so it reads as a
 *     poster, not a thumbnail
 *   - name (display weight, tracking-tight, balanced wrap)
 *   - ticker pill, tier badge, status dot
 *   - identity block: token / patron / creator address with copy + scan
 *   - a single secondary line below for the description (max 2 lines,
 *     pretty wrap, kept calm)
 *
 * Style discipline: variance 6 / motion 4 / density 4.
 * Single accent. No purple. No glow. tabular-nums for ids.
 */
"use client";

import type { Address } from "viem";

import type { AgentData } from "@/components/agent-home/types";
import { tierDisplay } from "@/components/agents-discover/agent-card-v2.helpers";
import { SurfaceCard } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

import AddressRow from "./address-row";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export interface AgentHeroV2Props {
	agent: AgentData;
	/** wave-M per-launch metadata. nullable for legacy / pre-wave-M tokens. */
	launch: AgentLaunchHeroSlice | null;
}

/**
 * Subset of `AgentLaunchByToken` the hero actually consumes. Keeping this
 * narrow makes the hero unit-testable + decoupled from the API client.
 */
export interface AgentLaunchHeroSlice {
	tier: number | null;
	creator: string | null;
	agentSafe: string | null;
}

export default function AgentHeroV2({ agent, launch }: AgentHeroV2Props) {
	const tier = tierDisplay(launch?.tier ?? null);
	const graduated = agent.status === "graduated";
	const pending = agent.status === "pending";

	// patron is the steward of an AgentSafe. We don't have a dedicated
	// patron column; the AgentSafe address is the steward-facing handle.
	const patronAddress = launch?.agentSafe ?? null;
	const creatorAddress = launch?.creator ?? agent.walletAddress ?? null;

	return (
		<section className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8" aria-label="agent identity">
			{/* poster */}
			<div className="lg:col-span-5">
				<SurfaceCard padding="none" className="relative aspect-square w-full overflow-hidden">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={agent.image ?? "/brand/icon/icon_on_black_512.png"}
						alt={`${agent.name} portrait`}
						className="h-full w-full object-cover transition-transform duration-700"
						style={{ transitionTimingFunction: EASE }}
					/>
					{/* inner hairline highlight - double-bezel lite */}
					<div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.04]" />
					{tier ? (
						<div className="absolute left-3 top-3">
							<span
								className={cn(
									"inline-flex h-6 items-center rounded-sm border px-2 font-mono text-[10px] uppercase tracking-[0.22em] backdrop-blur-sm",
									tier.tone,
								)}
							>
								{tier.name}
							</span>
						</div>
					) : null}
					<div className="absolute right-3 top-3">
						<StatusBadge graduated={graduated} pending={pending} />
					</div>
				</SurfaceCard>
			</div>

			{/* identity */}
			<div className="flex flex-col gap-5 lg:col-span-7">
				<div className="flex flex-col gap-3">
					<div className="flex items-baseline gap-3 flex-wrap">
						<h1 className="text-3xl md:text-4xl text-white leading-[1.05] tracking-tight text-balance">{agent.name}</h1>
						<span className="inline-flex h-7 items-center rounded-sm border border-white/15 bg-white/[0.03] px-2 font-mono text-[12px] tracking-wider text-white/70">
							${agent.ticker}
						</span>
					</div>

					{agent.description ? (
						<p className="text-[13px] md:text-sm text-white/55 leading-relaxed max-w-[60ch] text-pretty">
							{agent.description}
						</p>
					) : null}
				</div>

				{/* address block. Three rows, hairline-divided. No big stat
				    cards here; this is identity, not data. */}
				<SurfaceCard padding="none" className="overflow-hidden">
					<div className="divide-y divide-white/[0.06]">
						<AddressRow label="token" address={agent.tokenAddress} />
						{patronAddress ? <AddressRow label="patron safe" address={patronAddress} /> : null}
						{creatorAddress && creatorAddress !== patronAddress ? (
							<AddressRow label="creator" address={creatorAddress} />
						) : null}
					</div>
				</SurfaceCard>
			</div>
		</section>
	);
}

function StatusBadge({ graduated, pending }: { graduated: boolean; pending: boolean }) {
	if (graduated) {
		return (
			<span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-white/20 bg-black/70 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70 backdrop-blur-sm">
				<span className="h-1 w-1 rounded-full bg-white/50" />
				graduated
			</span>
		);
	}
	if (pending) {
		return (
			<span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-white/15 bg-black/70 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 backdrop-blur-sm">
				<span className="h-1 w-1 rounded-full bg-white/30" />
				pending
			</span>
		);
	}
	return (
		<span className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-[#00ff87]/40 bg-black/70 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#00ff87] backdrop-blur-sm">
			<span className="h-1 w-1 animate-pulse rounded-full bg-[#00ff87]" />
			live
		</span>
	);
}

/**
 * Re-export the Address type so the page can pass through without
 * importing viem for this one prop.
 */
export type { Address };
