"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { AgentDetail } from "@/lib/api/patron";
import { cn } from "@/lib/utils";
import Image from "next/image";

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
	const { t } = useTranslation();
	if (isLoading || !agent) {
		return (
			<div className="flex items-start gap-5 animate-pulse">
				<div className="w-20 h-20 rounded-sm bg-[#141414]" />
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
			aria-label={t("patron.launchReadyHero.ariaLabel")}
			className="relative overflow-hidden rounded-sm border border-stroke bg-[#0A0A0A]"
		>
			{/* subtle ambient glow: calm, not neon */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-accent/[0.04] blur-3xl"
			/>

			<div className="relative px-6 py-12 md:px-10 md:py-14">
				<div className="flex items-start gap-6 flex-wrap">
					<div
						className={cn(
							"w-20 h-20 md:w-24 md:h-24 rounded-sm overflow-hidden bg-[#141414] border border-stroke shrink-0",
							"ring-1 ring-accent/20",
						)}
					>
						{agent.avatar ? (
							<Image
								src={agent.avatar}
								alt={t("patron.agentHero.avatarAlt", { name: agent.name })}
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
						</div>
						<h1 className="mt-4 text-3xl md:text-4xl font-bold text-white tracking-tight leading-[1.05]">
							{agent.name}
						</h1>
						<p className="text-sm text-neutral-400 font-mono mt-1">${agent.ticker}</p>
						{bio ? <p className="mt-5 max-w-[60ch] text-[15px] leading-relaxed text-neutral-300">{bio}</p> : null}
						<p className="mt-6 max-w-[60ch] text-sm leading-relaxed text-neutral-400">
							{t("patron.launchReadyHero.bodyNote")}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function ReadyPill() {
	const { t } = useTranslation();
	return (
		<span
			className="inline-flex items-center gap-2 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] rounded-sm border bg-accent/10 text-accent border-accent/30 animate-pulse motion-reduce:animate-none"
			// biome-ignore lint/a11y/useSemanticElements: <output> is for form-related results; this is a generic status indicator
			role="status"
			aria-label={t("patron.launchReadyHero.readyPillAria")}
		>
			<span className="relative inline-flex w-1.5 h-1.5">
				<span
					aria-hidden="true"
					className="absolute inset-0 rounded-full bg-accent/60 animate-ping motion-reduce:hidden"
				/>
				<span aria-hidden="true" className="relative w-1.5 h-1.5 rounded-full bg-accent" />
			</span>
			{t("patron.launchReadyHero.readyPill")}
		</span>
	);
}
