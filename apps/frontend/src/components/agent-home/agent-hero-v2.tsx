/**
 * AgentHeroV2. The premium hero for the wave-M+ agent page.
 *
 * Layout (lg+): asymmetric 5/7 split. Poster image on the left, identity
 * stack on the right. On mobile it collapses to a single column with the
 * poster on top.
 *
 * What's surfaced (top to bottom on the right):
 *   - lede sentence (the page's first impression: positions THIS agent in
 *     one calm narrative line above the name)
 *   - status moment (live + day counter + last-action chip)
 *   - name (display weight, tracking-tight) + tier badge + ticker pill
 *   - description (calm, max 60ch)
 *   - signature stat (one editorial number above the fold, no 3-stat trio)
 *   - primary actions row (trade / swap / share / scan)
 *
 * The hero no longer surfaces address rows: addresses moved to the
 * IdentityPanel where they get editorial micro-copy. The hero is for who
 * the agent IS, not provenance.
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

import { buildLede, buildSignatureStat, buildStatusMoment } from "./hero-copy";
import PrimaryActions from "./primary-actions";

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
	taxSplit: { platformBps: number; patronBps: number; agentBps: number } | null;
	state: string | null;
	launchTimestamp: number | null;
	closeTimestamp: number | null;
	depositorCount: number | null;
}

export default function AgentHeroV2({ agent, launch }: AgentHeroV2Props) {
	const tier = tierDisplay(launch?.tier ?? null);
	const graduated = agent.status === "graduated";
	const pending = agent.status === "pending";

	const lede = buildLede({ agent, launch });
	const status = buildStatusMoment({ agent, launch });
	const stat = buildSignatureStat({ agent, launch });

	return (
		<section className="grid grid-cols-1 gap-7 lg:grid-cols-12 lg:gap-10" aria-label="agent identity">
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
					{/* legibility floor at the bottom so the name reads if the poster is busy */}
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
					{tier ? (
						<div className="absolute left-3 top-3">
							<span
								className={cn(
									"inline-flex h-7 items-center rounded-sm border px-2.5 font-mono text-[11px] uppercase tracking-[0.24em] backdrop-blur-sm",
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
			<div className="flex flex-col gap-7 lg:col-span-7">
				{/* status moment: live · day N · last action */}
				<StatusMoment moment={status} graduated={graduated} pending={pending} />

				<div className="flex flex-col gap-4">
					{/* lede sentence: the first thing that registers; positions the agent */}
					{lede ? (
						<p
							className="font-sans text-[17px] md:text-[20px] leading-[1.35] text-white/80 text-balance max-w-[44ch]"
							style={{ letterSpacing: "-0.005em" }}
						>
							{lede}
						</p>
					) : null}

					{/* name + ticker */}
					<div className="flex items-baseline gap-3 flex-wrap">
						<h1 className="text-4xl md:text-5xl text-white leading-[1] tracking-tight text-balance">{agent.name}</h1>
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

				{/* one editorial stat above the fold */}
				{stat ? <SignatureStat stat={stat} /> : null}

				{/* primary actions */}
				<PrimaryActions agent={agent} />
			</div>
		</section>
	);
}

function StatusMoment({
	moment,
	graduated,
	pending,
}: {
	moment: ReturnType<typeof buildStatusMoment>;
	graduated: boolean;
	pending: boolean;
}) {
	const dotTone = graduated ? "bg-white/55" : pending ? "bg-white/35" : "bg-[#00ff87]";
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] uppercase tracking-[0.22em]">
			<span className="inline-flex items-center gap-1.5 text-white/55">
				<span className={cn("h-1.5 w-1.5 rounded-full", dotTone, !graduated && !pending && "animate-pulse")} />
				{moment.state}
			</span>
			{moment.parts.map((p, i) => (
				<span key={i} className="inline-flex items-center gap-3 text-white/40">
					<span className="text-white/15">·</span>
					<span>{p}</span>
				</span>
			))}
		</div>
	);
}

function SignatureStat({ stat }: { stat: { label: string; value: string; tone?: "accent" | "neutral" } }) {
	const tone = stat.tone === "accent" ? "text-[#00ff87]" : "text-white";
	return (
		<div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-5">
			<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">{stat.label}</span>
			<span className={cn("font-mono text-3xl md:text-4xl tabular-nums leading-none tracking-tight", tone)}>
				{stat.value}
			</span>
		</div>
	);
}

function StatusBadge({ graduated, pending }: { graduated: boolean; pending: boolean }) {
	if (graduated) {
		return (
			<span className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-white/20 bg-black/70 px-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm">
				<span className="h-1.5 w-1.5 rounded-full bg-white/50" />
				graduated
			</span>
		);
	}
	if (pending) {
		return (
			<span className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-white/15 bg-black/70 px-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 backdrop-blur-sm">
				<span className="h-1.5 w-1.5 rounded-full bg-white/30" />
				pending
			</span>
		);
	}
	return (
		<span className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-[#00ff87]/40 bg-black/70 px-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87] backdrop-blur-sm">
			<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00ff87]" />
			live
		</span>
	);
}

/**
 * Re-export the Address type so the page can pass through without
 * importing viem for this one prop.
 */
export type { Address };
