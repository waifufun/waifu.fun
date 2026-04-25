"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLaunchState, type LaunchStatus } from "@/lib/api/launches";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Stage = "authorizing" | "submitting" | "confirming" | "live" | "failed";

type Props = {
	open: boolean;
	launchId: string | undefined;
	/** Ticker for the celebration headline. */
	ticker?: string | null;
	/** Initial stage when the overlay opens (set by parent after the authorize POST). */
	initialStage?: Stage;
	/** Forced error message — overrides server state when provided (e.g. local fetch error). */
	errorOverride?: string | null;
	onClose: () => void;
	/** Called once the launch is `live`. Parent handles the redirect. */
	onLive?: (tokenAddress: string | null | undefined) => void;
	/** Called when the user clicks "Try again" on a failed launch. */
	onRetry?: () => void;
};

const STAGE_ORDER: Stage[] = ["authorizing", "submitting", "confirming", "live"];

const STAGE_COPY: Record<Stage, { title: string; subtitle: string }> = {
	authorizing: {
		title: "Authorizing launch",
		subtitle: "Verifying your signature and locking the launch parameters.",
	},
	submitting: {
		title: "Submitting four.meme transaction",
		subtitle: "The agent's Safe is signing the create-token call.",
	},
	confirming: {
		title: "Waiting for confirmation",
		subtitle: "Block producers are picking up the transaction.",
	},
	live: {
		title: "Token alive on bonding curve",
		subtitle: "Your agent is born. Redirecting to its public page.",
	},
	failed: {
		title: "Launch failed",
		subtitle: "Something went wrong on the way to the curve.",
	},
};

function statusToStage(status: LaunchStatus | undefined): Stage {
	switch (status) {
		case "queued":
			return "submitting";
		case "launching":
			return "confirming";
		case "live":
			return "live";
		case "failed":
			return "failed";
		default:
			return "authorizing";
	}
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M3 8.5l3 3L13 5" />
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M4 4l8 8M12 4l-8 8" />
		</svg>
	);
}

function StageRow({
	stage,
	state,
}: {
	stage: Stage;
	state: "pending" | "active" | "done" | "failed" | "live";
}) {
	const copy = STAGE_COPY[stage];
	return (
		<motion.div
			layout
			className={cn(
				"flex items-start gap-4 py-4 transition-colors",
				state === "active" && "text-white",
				state === "done" && "text-neutral-400",
				state === "pending" && "text-neutral-600",
				state === "failed" && "text-red-300",
			)}
		>
			<div
				className={cn(
					"mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors",
					state === "active" && "border-accent/50 bg-accent/10 text-accent",
					state === "done" && "border-accent/40 bg-accent/15 text-accent",
					state === "pending" && "border-stroke text-neutral-600",
					state === "failed" && "border-red-500/50 bg-red-500/10 text-red-300",
				)}
			>
				{state === "done" || state === "live" ? (
					<CheckIcon className="w-3.5 h-3.5" />
				) : state === "failed" ? (
					<XIcon className="w-3.5 h-3.5" />
				) : state === "active" ? (
					<motion.span
						className="w-2 h-2 rounded-full bg-accent"
						animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
						transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					/>
				) : (
					<span className="w-1.5 h-1.5 rounded-full bg-neutral-700" aria-hidden="true" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium leading-tight">{copy.title}</div>
				<div className="text-xs text-neutral-500 mt-1 leading-relaxed">{copy.subtitle}</div>
			</div>
		</motion.div>
	);
}

export default function LaunchProgress({
	open,
	launchId,
	ticker,
	initialStage = "authorizing",
	errorOverride = null,
	onClose,
	onLive,
	onRetry,
}: Props) {
	const { data: launch, error: pollError } = useLaunchState(launchId, {
		pollMs: 2000,
		enabled: open && Boolean(launchId),
	});

	const serverStage = statusToStage(launch?.status);
	const stage: Stage = errorOverride ? "failed" : launch?.status ? serverStage : initialStage;

	// Trigger onLive callback exactly once when we hit `live`.
	const [celebrated, setCelebrated] = useState(false);
	useEffect(() => {
		if (!open) {
			setCelebrated(false);
			return;
		}
		if (stage === "live" && !celebrated) {
			setCelebrated(true);
			// Small dramatic pause before parent redirects.
			const t = setTimeout(() => {
				onLive?.(launch?.tokenAddress ?? null);
			}, 2000);
			return () => clearTimeout(t);
		}
		return undefined;
	}, [stage, celebrated, onLive, launch?.tokenAddress, open]);

	const errorMessage = errorOverride ?? (stage === "failed" ? (launch?.error ?? "Launch did not complete.") : null);

	const stageStates = useMemo(() => {
		const currentIndex = stage === "failed" ? -1 : STAGE_ORDER.indexOf(stage);
		return STAGE_ORDER.map((s, i) => {
			if (stage === "failed") {
				// Mark every stage that hadn't completed as pending and
				// flag the last-known active one as failed.
				const failedIdx = launch?.status === "launching" ? 2 : launch?.status === "queued" ? 1 : 0;
				if (i < failedIdx) return { stage: s, state: "done" as const };
				if (i === failedIdx) return { stage: s, state: "failed" as const };
				return { stage: s, state: "pending" as const };
			}
			if (i < currentIndex) return { stage: s, state: "done" as const };
			if (i === currentIndex) return { stage: s, state: "active" as const };
			return { stage: s, state: "pending" as const };
		});
	}, [stage, launch?.status]);

	// Backdrop motion variants — quick fade only.
	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					key="launch-progress"
					role="dialog"
					aria-modal="true"
					aria-label="Launching token"
					className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
				>
					<motion.div
						aria-hidden="true"
						className="absolute inset-0 bg-black/80 backdrop-blur-md"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					/>

					{/* Live celebration — overlay sits on top of the stage list when `live`. */}
					<AnimatePresence>
						{stage === "live" && launch ? (
							<motion.div
								key="celebration"
								className="relative z-10 text-center px-6"
								initial={{ opacity: 0, scale: 0.96 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
							>
								<p className="text-xs uppercase tracking-[0.3em] text-accent mb-4">live</p>
								<h2 className="text-5xl md:text-7xl text-white tracking-tight font-medium leading-[1.05]">
									<span className="font-mono">${(ticker ?? "token").replace(/^\$/, "")}</span>
									<span className="text-accent"> is alive.</span>
								</h2>
								<p className="text-sm text-neutral-400 mt-6">Redirecting to the public page…</p>
							</motion.div>
						) : (
							<motion.div
								key="progress-card"
								className={cn(
									"relative z-10 w-full max-w-md rounded-md border bg-[#0A0A0A] overflow-hidden",
									errorMessage ? "border-red-500/40" : "border-stroke",
								)}
								initial={{ y: 12, opacity: 0 }}
								animate={{ y: 0, opacity: 1 }}
								exit={{ y: -8, opacity: 0 }}
								transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
							>
								{/* Subtle ambient — no neon */}
								<div
									aria-hidden="true"
									className={cn(
										"pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl",
										errorMessage ? "bg-red-500/5" : "bg-accent/[0.04]",
									)}
								/>

								<header className="relative px-6 pt-7 pb-4 border-b border-stroke">
									<p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
										{errorMessage ? "Launch interrupted" : "Launching"}
									</p>
									<h2 className="mt-1 text-lg text-white tracking-tight">
										{errorMessage ? "We hit a snag" : STAGE_COPY[stage].title}
									</h2>
								</header>

								<div className="relative px-6 py-2 divide-y divide-stroke">
									{stageStates.map(({ stage: s, state }) => (
										<StageRow key={s} stage={s} state={state} />
									))}
								</div>

								{errorMessage ? (
									<div className="relative px-6 py-5 border-t border-red-500/30 bg-red-500/[0.03] space-y-4">
										<p role="alert" className="text-sm text-red-300 leading-relaxed">
											{errorMessage}
										</p>
										<div className="flex items-center gap-3">
											{onRetry ? (
												<Button
													type="button"
													onClick={onRetry}
													className="h-9 bg-red-500/10 hover:bg-red-500/20 text-red-200 border border-red-500/40"
												>
													Try again
												</Button>
											) : null}
											<button
												type="button"
												onClick={onClose}
												className="text-xs text-neutral-400 hover:text-white underline-offset-4 hover:underline"
											>
												Close
											</button>
										</div>
									</div>
								) : pollError ? (
									<div className="relative px-6 py-3 text-[11px] text-[#a1a1aa] border-t border-stroke">
										Network blip while polling. Retrying…
									</div>
								) : null}
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
