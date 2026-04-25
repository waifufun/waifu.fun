"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "./wizard-icons";
import { STEP_LABELS, useStepValid, useWizard, WIZARD_STEPS, type WizardStep } from "./wizard-state";

const TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

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
};

export default function WizardShell({ stepContent, onComplete, provisioning }: Props) {
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
			// Walk forward — every previous step must be valid.
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
					<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
						Provisioning {String(stepIndex + 1).padStart(2, "0")} / {String(WIZARD_STEPS.length).padStart(2, "0")}
					</p>
					<h1 className="mt-3 text-3xl md:text-4xl font-medium text-white tracking-tight leading-[1.05]">
						{step === "persona" ? "Who are they?" : null}
						{step === "runtime" ? "Where do they live?" : null}
						{step === "safe" ? "How do they spend?" : null}
						{step === "review" ? "Ready to wake them up?" : null}
					</h1>
					<p className="mt-3 text-sm text-neutral-400 leading-relaxed max-w-[52ch]">
						{step === "persona"
							? "Pick a name, ticker, and a one-line bio. The agent inherits this identity from launch."
							: null}
						{step === "runtime"
							? "Run on our hosted cloud, or wire up an agent you already have. You can change this later."
							: null}
						{step === "safe"
							? "Treasury rules and adapters. Defaults are sane. Tweak any of this later from /patron."
							: null}
						{step === "review" ? "Last look. Provisioning costs gas plus a small one-time setup fee." : null}
					</p>
				</header>

				<nav className="mb-10" aria-label="Wizard steps">
					<ol className="grid grid-cols-4 gap-2">
						{WIZARD_STEPS.map((s, i) => {
							const isComplete = i < stepIndex;
							const isCurrent = i === stepIndex;
							return (
								<li key={s}>
									<button
										type="button"
										onClick={() => handleStepClick(s)}
										aria-current={isCurrent ? "step" : undefined}
										aria-label={`Step ${i + 1}: ${STEP_LABELS[s]}`}
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
													backgroundColor: isComplete || isCurrent ? "#22c55e" : "rgba(255,255,255,0.1)",
												}}
												transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
												className="absolute inset-0 origin-left"
											/>
										</div>
										<div className="flex items-center gap-1.5">
											<span
												className={cn(
													"font-mono text-[10px] tabular-nums tracking-[0.18em] uppercase",
													isCurrent ? "text-white" : "text-neutral-500",
												)}
											>
												{String(i + 1).padStart(2, "0")}
											</span>
											<span className={cn("text-[11px] tracking-tight", isCurrent ? "text-white" : "text-neutral-500")}>
												{STEP_LABELS[s]}
											</span>
											{isComplete ? <CheckIcon className="h-3 w-3 text-[#22c55e]" /> : null}
										</div>
									</button>
								</li>
							);
						})}
					</ol>
					<div className="sr-only" aria-live="polite">
						{Math.round(progressPct)} percent complete
					</div>
				</nav>

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
						Back
					</button>

					<div className="flex items-center gap-3 min-h-[20px]">
						{!valid && reason ? (
							<p className="text-xs text-neutral-500 font-mono uppercase tracking-wider hidden sm:block">{reason}</p>
						) : null}
						<button
							type="button"
							onClick={() => (isLast ? onComplete() : next())}
							disabled={!valid || provisioning}
							className={cn(
								"group inline-flex items-center gap-3 h-10 pl-5 pr-2 text-sm font-medium tracking-tight",
								"bg-[#22c55e] text-black",
								"transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
								"hover:bg-[#16a34a] active:translate-y-[1px]",
								"disabled:bg-neutral-800 disabled:text-neutral-600 disabled:pointer-events-none",
							)}
						>
							<span>{isLast ? "Provision agent" : "Continue"}</span>
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
			const { name, ticker, bio } = state.persona;
			if (!name.trim()) return "Pick a name";
			if (name.length > 48) return "Name too long";
			if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return "Ticker: 2-10 uppercase letters or digits";
			if (bio.length > 240) return "Bio too long";
			return null;
		}
		case "runtime": {
			if (state.runtime.kind === "webhook") {
				const url = state.runtime.webhookUrl.trim();
				if (!url) return "Webhook URL required";
				try {
					new URL(url);
				} catch {
					return "Invalid URL";
				}
			}
			return null;
		}
		default:
			return null;
	}
}
