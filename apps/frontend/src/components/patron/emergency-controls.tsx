"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { errorText } from "@/lib/api/_fetcher";
import { type AgentControlState, useKillAgent, usePauseAgent, useResumeAgent } from "@/lib/api/patron";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * Patron break-glass controls. Wired to the patron-scoped, ownership-gated
 * v2 routes:
 *
 *   Pause/Resume \u2192 POST /v2/agents/:id/pause  | /v2/agents/:id/resume
 *   Kill         \u2192 POST /v2/agents/:id/kill   (permanent, confirmation-gated)
 *
 * The pause route halts the brain AND freezes withdrawals together \u2014 there is
 * no patron-scoped "freeze withdrawals only" route on the API. Rather than fake
 * a partial control, the "Freeze withdrawals" tile is disabled with a tooltip
 * explaining it's folded into Pause. Honesty over completeness.
 *
 * A killed agent is terminal: pause/resume tiles disable once `killed` is true.
 */

const EMPTY_STATE: AgentControlState = {
	brainPaused: false,
	withdrawalsPaused: false,
	killed: false,
	killedAt: null,
};

type Tone = "neutral" | "warn" | "destructive";

const TONE: Record<Tone, string> = {
	neutral: "border-stroke-strong text-[#a1a1aa] hover:border-white/40",
	warn: "border-stroke-strong text-[#71717a]",
	destructive: "border-red-500/30 text-red-300 hover:border-red-500/60",
};

function ControlTile({
	label,
	description,
	tone,
	disabled,
	disabledReason,
	pending,
	onClick,
}: {
	label: string;
	description: string;
	tone: Tone;
	disabled?: boolean | undefined;
	disabledReason?: string | undefined;
	pending?: boolean | undefined;
	onClick?: (() => void) | undefined;
}) {
	const button = (
		<button
			type="button"
			disabled={disabled || pending}
			aria-disabled={disabled || pending}
			aria-label={pending ? `${label} (working\u2026)` : label}
			onClick={onClick}
			className={cn(
				"flex flex-col items-start gap-1 text-left p-4 rounded-sm border bg-[#0C0C0C] transition-colors w-full",
				TONE[tone],
				disabled || pending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
			)}
		>
			<span className="text-sm font-medium">{pending ? "working\u2026" : label}</span>
			<span className="text-xs text-neutral-400 leading-snug">{description}</span>
		</button>
	);

	if (disabled && disabledReason) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="block w-full">{button}</span>
				</TooltipTrigger>
				<TooltipContent side="top">{disabledReason}</TooltipContent>
			</Tooltip>
		);
	}
	return button;
}

export default function EmergencyControls({
	agentId,
	controlState,
}: {
	agentId?: string | undefined;
	controlState?: AgentControlState | undefined;
}) {
	const state = controlState ?? EMPTY_STATE;
	const killed = state.killed;
	const brainPaused = state.brainPaused;

	const pause = usePauseAgent(agentId);
	const resume = useResumeAgent(agentId);
	const kill = useKillAgent(agentId);

	const [killOpen, setKillOpen] = useState(false);
	// Per-action result banners. Kept separate so a stale error on one action
	// doesn't blot out a fresh success on another.
	const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

	const anyPending = pause.isPending || resume.isPending || kill.isPending;

	const runPause = async () => {
		setBanner(null);
		try {
			await pause.mutateAsync(undefined);
			setBanner({ tone: "ok", text: "agent paused. brain halted, withdrawals frozen." });
		} catch (err) {
			setBanner({ tone: "err", text: errorText(err, "couldn't pause the agent.") });
		}
	};

	const runResume = async () => {
		setBanner(null);
		try {
			await resume.mutateAsync(undefined);
			setBanner({ tone: "ok", text: "agent resumed. brain + withdrawals live again." });
		} catch (err) {
			setBanner({ tone: "err", text: errorText(err, "couldn't resume the agent.") });
		}
	};

	const runKill = async () => {
		setBanner(null);
		try {
			await kill.mutateAsync(undefined);
			setKillOpen(false);
			setBanner({ tone: "ok", text: "agent killed. this is permanent." });
		} catch (err) {
			setKillOpen(false);
			setBanner({ tone: "err", text: errorText(err, "couldn't kill the agent.") });
		}
	};

	const noAgent = !agentId;

	return (
		<section aria-label="Emergency controls" className="p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C]">
			<header className="flex items-center justify-between mb-1">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">Emergency</h2>
				{killed ? (
					<span className="text-xs text-red-400 uppercase tracking-wide">killed</span>
				) : brainPaused ? (
					<span className="text-xs text-amber-400 uppercase tracking-wide">paused</span>
				) : (
					<span className="text-xs text-neutral-500 uppercase tracking-wide">active</span>
				)}
			</header>
			<p className="text-xs text-neutral-500 mb-4">
				Break-glass controls. Pause halts the brain and freezes withdrawals together. Kill is permanent.
			</p>

			{banner ? (
				<output
					className={cn(
						"block mb-4 px-3 py-2 rounded-sm border text-xs",
						banner.tone === "ok"
							? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
							: "border-red-500/30 bg-red-500/5 text-red-300",
					)}
				>
					{banner.text}
				</output>
			) : null}

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				{/* Pause / Resume toggle */}
				{brainPaused ? (
					<ControlTile
						label="Resume brain"
						description="Lift the pause. Brain resumes, withdrawals unfreeze."
						tone="neutral"
						disabled={noAgent || killed}
						disabledReason={
							noAgent
								? "agent not loaded yet."
								: killed
									? "agent is permanently killed; it can't be resumed."
									: undefined
						}
						pending={resume.isPending}
						onClick={runResume}
					/>
				) : (
					<ControlTile
						label="Pause brain"
						description="Halt new actions and freeze withdrawals while you investigate."
						tone="neutral"
						disabled={noAgent || killed}
						disabledReason={noAgent ? "agent not loaded yet." : killed ? "agent is permanently killed." : undefined}
						pending={pause.isPending}
						onClick={runPause}
					/>
				)}

				{/* Freeze withdrawals: no patron-scoped withdrawals-only route exists.
				    Pause already covers it. Disabled + honest tooltip rather than faked. */}
				<ControlTile
					label="Freeze withdrawals"
					description="Folded into Pause \u2014 no separate patron route for withdrawals-only."
					tone="warn"
					disabled
					disabledReason="No standalone patron endpoint. Use Pause, which freezes withdrawals too."
				/>

				{/* Kill */}
				<ControlTile
					label="Kill agent"
					description="Full stop. Permanent, irreversible shutdown."
					tone="destructive"
					disabled={noAgent || killed}
					disabledReason={noAgent ? "agent not loaded yet." : killed ? "agent is already killed." : undefined}
					pending={kill.isPending}
					onClick={() => {
						setBanner(null);
						setKillOpen(true);
					}}
				/>
			</div>

			<Dialog open={killOpen} onOpenChange={(open) => !anyPending && setKillOpen(open)}>
				<DialogContent className="border border-red-500/40 bg-[#0C0C0C] p-6">
					<DialogHeader>
						<DialogTitle className="text-red-300">Kill this agent?</DialogTitle>
						<DialogDescription className="text-neutral-400 leading-relaxed">
							This permanently shuts the agent down. The brain stops, withdrawals freeze, and the agent can never be
							resumed. This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<button
							type="button"
							disabled={kill.isPending}
							onClick={() => setKillOpen(false)}
							className="px-4 py-2 rounded-sm border border-stroke-strong text-sm text-neutral-300 hover:border-white/40 disabled:opacity-60"
						>
							Cancel
						</button>
						<button
							type="button"
							disabled={kill.isPending}
							onClick={runKill}
							className="px-4 py-2 rounded-sm border border-red-500/50 bg-red-500/10 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-60"
						>
							{kill.isPending ? "killing\u2026" : "Kill permanently"}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
