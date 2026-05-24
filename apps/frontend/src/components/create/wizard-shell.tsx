"use client";

import { useTranslation } from "@/contexts/locale-context";
import { EASE_HERO } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "./wizard-icons";
import { WIZARD_STEPS, type WizardStep, useStepValid, useWizard } from "./wizard-state";

const TRANSITION = { duration: 0.32, ease: EASE_HERO };

export function useWizardStep(): {
	step: WizardStep;
	stepIndex: number;
	goTo: (s: WizardStep) => void;
	next: () => void;
	prev: () => void;
	isFirst: boolean;
	isLast: boolean;
} {
	const router = useRouter();
	const params = useSearchParams();
	const raw = params?.get("step") ?? "persona";
	const step: WizardStep = (WIZARD_STEPS as readonly string[]).includes(raw) ? (raw as WizardStep) : "persona";
	const stepIndex = WIZARD_STEPS.indexOf(step);

	const goTo = useCallback(
		(s: WizardStep) => {
			const next = new URLSearchParams(params?.toString() ?? "");
			next.set("step", s);
			router.replace(`/create/wizard?${next.toString()}`, { scroll: false });
		},
		[params, router],
	);

	const next = useCallback(() => {
		const idx = WIZARD_STEPS.indexOf(step);
		if (idx < WIZARD_STEPS.length - 1) goTo(WIZARD_STEPS[idx + 1] as WizardStep);
	}, [step, goTo]);

	const prev = useCallback(() => {
		const idx = WIZARD_STEPS.indexOf(step);
		if (idx > 0) goTo(WIZARD_STEPS[idx - 1] as WizardStep);
	}, [step, goTo]);

	return {
		step,
		stepIndex,
		goTo,
		next,
		prev,
		isFirst: stepIndex === 0,
		isLast: stepIndex === WIZARD_STEPS.length - 1,
	};
}

type Props = {
	stepContent: Record<WizardStep, ReactNode>;
	onComplete: () => void;
	provisioning?: boolean;
	completeLabel?: string;
};

export default function WizardShell({ stepContent, onComplete, provisioning, completeLabel }: Props) {
	const { t } = useTranslation();
	const { step, stepIndex, goTo, next, prev, isFirst, isLast } = useWizardStep();
	const { valid, reason } = useStepValid(step);
	const { state } = useWizard();

	// Block any forward jump past the next-incomplete step. Allow backward jumps freely.
	const handleStepClick = useCallback(
		(target: WizardStep) => {
			const targetIdx = WIZARD_STEPS.indexOf(target);
			if (targetIdx <= stepIndex) {
				goTo(target);
				return;
			}
			// Walk forward. Every previous step must be valid.
			for (let i = 0; i < targetIdx; i++) {
				const s = WIZARD_STEPS[i] as WizardStep;
				const reasonForStep = useStepValidStatic(s, state);
				if (reasonForStep !== null) return;
			}
			goTo(target);
		},
		[stepIndex, goTo, state],
	);

	// Keyboard: Enter advances if valid + not in textarea
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key !== "Enter") return;
			const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
			if (tag === "textarea" || tag === "button") return;
			if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
			if (!valid || provisioning) return;
			if (isLast) {
				onComplete();
			} else {
				next();
			}
			e.preventDefault();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [valid, isLast, next, onComplete, provisioning]);

	const progressPct = useMemo(() => ((stepIndex + 1) / WIZARD_STEPS.length) * 100, [stepIndex]);

	return (
		<div className="w-full min-h-[100dvh] px-4 py-12 md:py-16">
			<div className="mx-auto w-full max-w-[640px]">
				<header className="mb-10">
					<p className="font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-500">
						{t("wizard.shell.stepCounter", {
							current: String(stepIndex + 1).padStart(2, "0"),
							total: String(WIZARD_STEPS.length).padStart(2, "0"),
						})}
					</p>
					<h1 className="mt-3 text-3xl md:text-4xl font-medium text-white tracking-tight leading-[1.05]">
						{t(`wizard.shell.titles.${step}`)}
					</h1>
					<p className="mt-3 text-sm text-neutral-400 leading-relaxed max-w-[52ch]">
						{t(`wizard.shell.subtitles.${step}`)}
					</p>
				</header>

				<nav className="mb-10" aria-label={t("wizard.shell.ariaSteps")}>
					<ol
						className={cn(
							"grid gap-2",
							WIZARD_STEPS.length === 6 ? "grid-cols-6" : WIZARD_STEPS.length === 5 ? "grid-cols-5" : "grid-cols-4",
						)}
					>
						{WIZARD_STEPS.map((s, i) => {
							const isComplete = i < stepIndex;
							const isCurrent = i === stepIndex;
							return (
								<li key={s}>
									<button
										type="button"
										onClick={() => handleStepClick(s)}
										aria-current={isCurrent ? "step" : undefined}
										aria-label={t("wizard.shell.ariaStep", {
											number: String(i + 1),
											label: t(`wizard.shell.labels.${s}`),
										})}
										className={cn(
											"group w-full text-left flex flex-col gap-2 py-1 transition-opacity duration-300",
											provisioning && "pointer-events-none opacity-60",
											!isComplete && !isCurrent && "opacity-40 hover:opacity-70",
										)}
									>
										<div className="relative h-[2px] w-full bg-white/5 overflow-hidden">
											<motion.span
												initial={false}
												animate={{
													scaleX: isComplete ? 1 : isCurrent ? 1 : 0,
													backgroundColor: isComplete || isCurrent ? "#00ff87" : "rgba(255,255,255,0.1)",
												}}
												transition={{ duration: 0.5, ease: EASE_HERO }}
												className="absolute inset-0 origin-left"
											/>
										</div>
										<div className="flex items-center gap-1.5">
											<span
												className={cn(
													"font-mono text-[10px] tabular-nums tracking-[0.2em] uppercase",
													isCurrent ? "text-white" : "text-neutral-500",
												)}
											>
												{String(i + 1).padStart(2, "0")}
											</span>
											<span
												className={cn(
													"text-[11px] tracking-tight lowercase",
													isCurrent ? "text-white" : "text-neutral-500",
												)}
											>
												{t(`wizard.shell.labels.${s}`)}
											</span>
											{isComplete ? <CheckIcon className="h-3 w-3 text-accent" /> : null}
										</div>
									</button>
								</li>
							);
						})}
					</ol>
					<div className="sr-only" aria-live="polite">
						{t("wizard.shell.progress", { pct: String(Math.round(progressPct)) })}
					</div>
				</nav>

				{/*
				 * Manual-fallback banner. Persistent across steps.
				 * The wizard is the hosted Eliza Cloud path; BYO agents skip it
				 * entirely and go through /give-skill.
				 */}
				<div className="mb-8 border-l-2 border-[#00ff87] bg-[#0A0F0C] p-4">
					<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-1.5">
						{t("wizard.shell.manualFallbackLabel")}
					</p>
					<p className="text-sm text-[#a1a1aa] leading-relaxed">
						{t("wizard.shell.manualFallbackBefore")}{" "}
						<a href="/give-skill" className="text-[#00ff87] hover:opacity-80 transition-opacity">
							{t("wizard.shell.manualFallbackLink")}
						</a>
						.
					</p>
				</div>

				<AnimatePresence mode="wait" initial={false}>
					<motion.section
						key={step}
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={TRANSITION}
						className="min-h-[280px]"
					>
						{stepContent[step]}
					</motion.section>
				</AnimatePresence>

				<footer className="mt-12 pt-6 border-t border-white/5 flex items-center justify-between gap-4">
					<button
						type="button"
						onClick={prev}
						disabled={isFirst || provisioning}
						className={cn(
							"inline-flex items-center gap-2 h-10 px-4 text-sm font-medium tracking-tight",
							"border border-white/10 text-neutral-300 bg-transparent",
							"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
							"hover:border-white/25 hover:text-white active:translate-y-[1px]",
							"disabled:opacity-30 disabled:pointer-events-none",
						)}
					>
						<ArrowLeftIcon className="h-3.5 w-3.5" />
						{t("wizard.common.back")}
					</button>

					<div className="flex items-center gap-3 min-h-[20px]">
						{!valid && reason ? (
							<p className="text-xs text-neutral-500 font-mono uppercase tracking-[0.2em] hidden sm:block">
								{formatValidationReason(t, reason)}
							</p>
						) : null}
						<button
							type="button"
							onClick={() => (isLast ? onComplete() : next())}
							disabled={!valid || provisioning}
							className={cn(
								"group inline-flex items-center gap-3 h-10 pl-5 pr-2 text-sm font-medium tracking-tight",
								"bg-accent text-black",
								"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
								"hover:bg-accent-dim active:translate-y-[1px]",
								"disabled:bg-neutral-800 disabled:text-neutral-600 disabled:pointer-events-none",
							)}
						>
							<span>
								{isLast ? (completeLabel ?? t("wizard.shell.defaultCompleteLabel")) : t("wizard.common.next")}
							</span>
							<span
								className={cn(
									"inline-flex items-center justify-center h-7 w-7 bg-black/15",
									"transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
									"group-hover:translate-x-0.5",
								)}
							>
								<ArrowRightIcon className="h-3.5 w-3.5" />
							</span>
						</button>
					</div>
				</footer>
			</div>
		</div>
	);
}

// --- helper used by the click-jump guard ---

function useStepValidStatic(step: WizardStep, state: ReturnType<typeof useWizard>["state"]): string | null {
	// Lightweight duplicate of validateStep so we don't violate hooks rules in a loop.
	switch (step) {
		case "persona": {
			// invite code optional at frontend; backend validates if provided.
			const { name, ticker, bio } = state.persona;
			if (!name.trim()) return "wizard.validation.pickName";
			if (name.length > 48) return "wizard.validation.nameTooLong";
			if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return "wizard.validation.tickerFormat";
			if (bio.length > 240) return "wizard.validation.bioTooLong";
			return null;
		}
		case "metadata": {
			if (!state.flap.description.trim()) return "wizard.validation.descriptionRequired";
			if (!state.flap.tokenImageDataUrl) return "wizard.validation.uploadTokenImage";
			if (!state.flap.metaCid) return "wizard.validation.uploadToFlapFirst";
			return null;
		}
		case "tier": {
			if (!state.launch.tierId) return "wizard.validation.pickTier";
			return null;
		}
		case "launchpad": {
			if (!state.launchpad.selectedId) return "wizard.validation.pickLaunchpad";
			return null;
		}
		default:
			return null;
	}
}

function formatValidationReason(t: (key: string, params?: Record<string, string>) => string, reason: string): string {
	if (reason.startsWith("wizard.validation.allocationsMustSum|")) {
		return t("wizard.validation.allocationsMustSum", { pct: reason.split("|")[1] ?? "" });
	}
	return reason.startsWith("wizard.") ? t(reason) : reason;
}
