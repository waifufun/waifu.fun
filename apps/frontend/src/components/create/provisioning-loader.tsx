"use client";

import { useTranslation } from "@/contexts/locale-context";
import { EASE_HERO } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useState } from "react";
import { CheckIcon } from "./wizard-icons";

export type ProvisioningStage = "safe" | "runtime" | "x-oauth" | "policies" | "done";

const STAGES: { id: Exclude<ProvisioningStage, "done">; labelKey: string; sublabelKey: string; durationMs: number }[] = [
	{
		id: "safe",
		labelKey: "wizard.provisioning.stages.safeLabel",
		sublabelKey: "wizard.provisioning.stages.safeSub",
		durationMs: 1600,
	},
	{
		id: "runtime",
		labelKey: "wizard.provisioning.stages.runtimeLabel",
		sublabelKey: "wizard.provisioning.stages.runtimeSub",
		durationMs: 1500,
	},
	{
		id: "x-oauth",
		labelKey: "wizard.provisioning.stages.xOauthLabel",
		sublabelKey: "wizard.provisioning.stages.xOauthSub",
		durationMs: 1200,
	},
	{
		id: "policies",
		labelKey: "wizard.provisioning.stages.policiesLabel",
		sublabelKey: "wizard.provisioning.stages.policiesSub",
		durationMs: 1300,
	},
];

const TRANSITION = { duration: 0.45, ease: EASE_HERO };

type Props = {
	/** Called once all stages plus the success hold complete. */
	onDone: () => void | Promise<void>;
	awaitingResponse?: boolean;
};

export default memo(function ProvisioningLoader({ onDone, awaitingResponse = false }: Props) {
	const { t } = useTranslation();
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
	const showingExtension = allDone && awaitingResponse;

	return (
		<output
			className="fixed inset-0 z-50 bg-[#08080a]/95 backdrop-blur-xl flex items-center justify-center px-4"
			aria-live="polite"
			aria-busy={!allDone}
			aria-label={t("wizard.provisioning.aria")}
		>
			<div className="w-full max-w-[520px] block">
				<header className="mb-10">
					<p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
						<AnimatePresence mode="wait" initial={false}>
							<motion.span
								key={showingExtension ? "awaiting" : allDone ? "live" : "provisioning"}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.3 }}
								className="inline-block"
							>
								{showingExtension ? t("wizard.provisioning.stillLaunching") : allDone ? t("wizard.provisioning.live") : t("wizard.provisioning.provisioning")}
							</motion.span>
						</AnimatePresence>
					</p>
					<AnimatePresence mode="wait" initial={false}>
						<motion.h2
							key={showingExtension ? "awaiting" : allDone ? "done" : "running"}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={TRANSITION}
							className="mt-3 text-2xl md:text-3xl text-white tracking-tight leading-[1.1]"
						>
							{showingExtension ? t("wizard.provisioning.stillLaunchingTitle") : allDone ? t("wizard.provisioning.alive") : t("wizard.provisioning.spinningUp")}
						</motion.h2>
					</AnimatePresence>
					<p className="mt-2 text-sm text-neutral-400 leading-relaxed">
						{showingExtension
							? t("wizard.provisioning.stillLaunchingSub")
							: allDone
								? t("wizard.provisioning.takingHome")
								: t("wizard.provisioning.seconds")}
					</p>

					{/* Macro progress */}
					<div className="mt-6 relative h-[2px] w-full bg-white/5 overflow-hidden">
						<motion.span
							initial={false}
							animate={{ scaleX: allDone ? 1 : totalProgress }}
							transition={{ duration: 0.6, ease: EASE_HERO }}
							className="absolute inset-0 origin-left bg-accent"
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
				{showingExtension ? (
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={TRANSITION}
						className="mt-8 flex items-center gap-3 text-sm text-neutral-300"
					>
						<span className="relative inline-flex h-4 w-4 items-center justify-center" aria-hidden>
							<motion.span
								className="absolute inset-0 border border-accent/50"
								animate={{ rotate: 360 }}
								transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
							/>
							<span className="h-1 w-1 bg-accent" />
						</span>
						<span>
							{t("wizard.provisioning.waiting")}
							<BlinkingDots />
						</span>
					</motion.div>
				) : null}
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
	const { t } = useTranslation();
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
							transition={{ duration: 0.3, ease: EASE_HERO }}
							className="inline-flex items-center justify-center h-5 w-5 border border-accent/40 text-accent"
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
								className="absolute inset-0 border border-accent/40"
								animate={{ opacity: [0.4, 1, 0.4] }}
								transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							/>
							<motion.span
								className="h-1.5 w-1.5 bg-accent"
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
					{t(stage.labelKey)}
					{status === "active" ? <BlinkingDots /> : null}
				</p>
				<p className="mt-0.5 text-[11px] font-mono text-neutral-500 leading-relaxed">{t(stage.sublabelKey)}</p>
			</div>
		</li>
	);
});

function BlinkingDots() {
	return (
		<motion.span
			aria-hidden
			className="inline-block ml-1 text-accent"
			animate={{ opacity: [0.2, 1, 0.2] }}
			transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
		>
			...
		</motion.span>
	);
}
