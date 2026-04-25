"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "./wizard-icons";

export type ProvisioningStage = "safe" | "runtime" | "x-oauth" | "policies" | "done";

const STAGES: { id: Exclude<ProvisioningStage, "done">; label: string; sublabel: string; durationMs: number }[] = [
	{
		id: "safe",
		label: "Deploying Safe",
		sublabel: "1-of-2 multisig with steward key",
		durationMs: 1600,
	},
	{
		id: "runtime",
		label: "Minting agent runtime",
		sublabel: "wiring plugins, treasury, adapters",
		durationMs: 1500,
	},
	{
		id: "x-oauth",
		label: "Wiring X OAuth",
		sublabel: "ready to post once you authorize",
		durationMs: 1200,
	},
	{
		id: "policies",
		label: "Seeding adapter policies",
		sublabel: "Pancake and Venus with default caps",
		durationMs: 1300,
	},
];

const TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

type Props = {
	/** Called once all stages plus the success hold complete. */
	onDone: () => void;
};

export default memo(function ProvisioningLoader({ onDone }: Props) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [allDone, setAllDone] = useState(false);

	useEffect(() => {
		if (allDone) return;
		if (currentIndex >= STAGES.length) {
			setAllDone(true);
			return;
		}
		const stage = STAGES[currentIndex];
		if (!stage) return;
		const t = window.setTimeout(() => {
			setCurrentIndex((i) => i + 1);
		}, stage.durationMs);
		return () => window.clearTimeout(t);
	}, [currentIndex, allDone]);

	useEffect(() => {
		if (!allDone) return;
		const t = window.setTimeout(() => {
			onDone();
		}, 1200);
		return () => window.clearTimeout(t);
	}, [allDone, onDone]);

	const totalProgress = Math.min(currentIndex / STAGES.length, 1);

	return (
		<output
			className="fixed inset-0 z-50 bg-[#08080a]/95 backdrop-blur-xl flex items-center justify-center px-4"
			aria-live="polite"
			aria-busy={!allDone}
			aria-label="Provisioning agent"
		>
			<div className="w-full max-w-[520px] block">
				<header className="mb-10">
					<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#22c55e]">
						<AnimatePresence mode="wait" initial={false}>
							<motion.span
								key={allDone ? "live" : "provisioning"}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.3 }}
								className="inline-block"
							>
								{allDone ? "Live" : "Provisioning"}
							</motion.span>
						</AnimatePresence>
					</p>
					<AnimatePresence mode="wait" initial={false}>
						<motion.h2
							key={allDone ? "done" : "running"}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={TRANSITION}
							className="mt-3 text-2xl md:text-3xl text-white tracking-tight leading-[1.1]"
						>
							{allDone ? "Your agent is alive." : "Spinning up your agent."}
						</motion.h2>
					</AnimatePresence>
					<p className="mt-2 text-sm text-neutral-400 leading-relaxed">
						{allDone ? "Redirecting to its home page..." : "This usually takes ten to fifteen seconds."}
					</p>

					{/* Macro progress */}
					<div className="mt-6 relative h-[2px] w-full bg-white/5 overflow-hidden">
						<motion.span
							initial={false}
							animate={{ scaleX: allDone ? 1 : totalProgress }}
							transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
							className="absolute inset-0 origin-left bg-[#22c55e]"
						/>
					</div>
				</header>

				<ol className="flex flex-col gap-1">
					{STAGES.map((stage, idx) => {
						const status: "pending" | "active" | "complete" =
							allDone || idx < currentIndex ? "complete" : idx === currentIndex ? "active" : "pending";
						return <Stage key={stage.id} stage={stage} status={status} />;
					})}
				</ol>
			</div>
		</output>
	);
});

const Stage = memo(function Stage({
	stage,
	status,
}: {
	stage: (typeof STAGES)[number];
	status: "pending" | "active" | "complete";
}) {
	return (
		<li
			className={cn(
				"flex items-start gap-4 py-3 transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
				status === "pending" && "opacity-30",
			)}
		>
			<span className="relative shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center" aria-hidden>
				<AnimatePresence mode="wait" initial={false}>
					{status === "complete" ? (
						<motion.span
							key="check"
							initial={{ scale: 0.6, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.6, opacity: 0 }}
							transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
							className="inline-flex items-center justify-center h-5 w-5 border border-[#22c55e]/40 text-[#22c55e]"
						>
							<CheckIcon className="h-3 w-3" />
						</motion.span>
					) : status === "active" ? (
						<motion.span
							key="active"
							initial={{ scale: 0.6, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.6, opacity: 0 }}
							transition={{ duration: 0.3 }}
							className="relative h-5 w-5 inline-flex items-center justify-center"
						>
							<motion.span
								className="absolute inset-0 border border-[#22c55e]/40"
								animate={{ opacity: [0.4, 1, 0.4] }}
								transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							/>
							<motion.span
								className="h-1.5 w-1.5 bg-[#22c55e]"
								animate={{ scale: [0.6, 1.1, 0.6] }}
								transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							/>
						</motion.span>
					) : (
						<motion.span
							key="pending"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="h-5 w-5 border border-white/10"
						/>
					)}
				</AnimatePresence>
			</span>

			<div className="flex-1 min-w-0">
				<p
					className={cn(
						"text-sm tracking-tight transition-colors duration-300",
						status === "complete" ? "text-neutral-400" : status === "active" ? "text-white" : "text-neutral-500",
					)}
				>
					{stage.label}
					{status === "active" ? <BlinkingDots /> : null}
				</p>
				<p className="mt-0.5 text-[11px] font-mono text-neutral-500 leading-relaxed">{stage.sublabel}</p>
			</div>
		</li>
	);
});

function BlinkingDots() {
	return (
		<motion.span
			aria-hidden
			className="inline-block ml-1 text-[#22c55e]"
			animate={{ opacity: [0.2, 1, 0.2] }}
			transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
		>
			...
		</motion.span>
	);
}
