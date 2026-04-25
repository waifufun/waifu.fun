"use client";

import Image from "next/image";
import type { AgentDetail } from "@/lib/api/patron";
import { cn } from "@/lib/utils";

type Props = {
	agent: AgentDetail | undefined;
	isLoading: boolean;
};

/**
 * LaunchReadyHero
 *
 * Editorial-style hero shown when an agent is fully provisioned but the
 * token has not yet been launched onto the bonding curve. Replaces the
 * regular AgentHero for `status = "provisioned"` (a.k.a. ready_to_launch).
 *
 * Design notes:
 *   - Calm, deliberate, expensive. No casino energy.
 *   - Status pill animates with a slow pulse (2s) only when motion is allowed.
 *   - Avatar gets a subtle "alive" ring to communicate that the agent exists
 *     even though its token does not.
 */
export default function LaunchReadyHero({ agent, isLoading }: Props) {
	if (isLoading || !agent) {
		return (
			<div className="flex items-start gap-5 animate-pulse">
				<div className="w-20 h-20 rounded-md bg-[#141414]" />
				<div className="flex-1 space-y-3 pt-2">
					<div className="h-6 w-56 bg-[#141414] rounded" />
					<div className="h-4 w-32 bg-[#141414] rounded" />
					<div className="h-3 w-72 bg-[#141414] rounded" />
				</div>
			</div>
		);
	}

	const bio = agent.bio ?? agent.description ?? null;

	return (
		<section
			aria-label="Agent ready to launch"
			className="relative overflow-hidden rounded-md border border-autofun-background-action-highlight/40 bg-[#0A0A0A]"
		>
			{/* subtle ambient glow — calm, not neon */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-green-500/[0.04] blur-3xl"
			/>

			<div className="relative px-6 py-12 md:px-10 md:py-14">
				<div className="flex items-start gap-6 flex-wrap">
					<div
						className={cn(
							"w-20 h-20 md:w-24 md:h-24 rounded-md overflow-hidden bg-[#141414] border border-autofun-background-action-highlight/40 shrink-0",
							"ring-1 ring-green-500/20",
						)}
					>
						{agent.avatar ? (
							<Image
								src={agent.avatar}
								alt={`${agent.name} avatar`}
								width={96}
								height={96}
								className="object-cover w-full h-full"
								unoptimized
							/>
						) : (
							<div className="w-full h-full flex items-center justify-center text-neutral-500 text-3xl font-mono">
								{agent.ticker?.[0] ?? "?"}
							</div>
						)}
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-3 flex-wrap">
							<ReadyPill />
							<span className="text-xs uppercase tracking-[0.2em] text-neutral-500">Stage 3 / 5</span>
						</div>
						<h1 className="mt-4 text-3xl md:text-4xl font-medium text-white tracking-tight leading-[1.05]">
							{agent.name}
						</h1>
						<p className="text-sm text-neutral-400 font-mono mt-1">${agent.ticker}</p>
						{bio ? <p className="mt-5 max-w-[60ch] text-[15px] leading-relaxed text-neutral-300">{bio}</p> : null}
						<p className="mt-6 max-w-[60ch] text-sm leading-relaxed text-neutral-400">
							Your agent is alive but the token isn&apos;t on the curve yet. You decide when to launch.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function ReadyPill() {
	return (
		<>
			<style jsx>{`
				@keyframes ready-pulse {
					0%, 100% { transform: scale(1); opacity: 1; }
					50% { transform: scale(1.04); opacity: 0.92; }
				}
				.ready-pulse {
					animation: ready-pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
					transform-origin: left center;
				}
				@media (prefers-reduced-motion: reduce) {
					.ready-pulse { animation: none; }
				}
			`}</style>
			<span
				className="ready-pulse inline-flex items-center gap-2 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] rounded border bg-green-500/10 text-green-400 border-green-500/30"
				role="status"
				aria-label="Agent status: ready to launch"
			>
				<span className="relative inline-flex w-1.5 h-1.5">
					<span
						aria-hidden="true"
						className="absolute inset-0 rounded-full bg-green-400/60 animate-ping motion-reduce:hidden"
					/>
					<span aria-hidden="true" className="relative w-1.5 h-1.5 rounded-full bg-green-400" />
				</span>
				Ready to launch
			</span>
		</>
	);
}
