"use client";

import { useTranslation } from "@/contexts/locale-context";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

type Step = {
	num: string;
	titleKey: string;
	bodyKey: string;
};

const STEPS: Step[] = [
	{ num: "01", titleKey: "patron.whatHappens.step1Title", bodyKey: "patron.whatHappens.step1Body" },
	{ num: "02", titleKey: "patron.whatHappens.step2Title", bodyKey: "patron.whatHappens.step2Body" },
	{ num: "03", titleKey: "patron.whatHappens.step3Title", bodyKey: "patron.whatHappens.step3Body" },
	{ num: "04", titleKey: "patron.whatHappens.step4Title", bodyKey: "patron.whatHappens.step4Body" },
];

function ChevronIcon({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M4 6l4 4 4-4" />
		</svg>
	);
}

export default function WhatHappensNext() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<section aria-label={t("patron.whatHappens.ariaLabel")} className="rounded-sm border border-stroke bg-[#0A0A0A]">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-controls="what-happens-next-body"
				className={cn(
					"w-full flex items-center justify-between gap-4 px-6 md:px-8 py-5",
					"text-left hover:bg-white/[0.02] transition-colors rounded-sm",
					"focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40",
				)}
			>
				<div>
					<p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{t("patron.whatHappens.eyebrow")}</p>
					<h3 className="text-sm text-white mt-1 tracking-tight">{t("patron.whatHappens.title")}</h3>
				</div>
				<motion.span
					animate={{ rotate: open ? 180 : 0 }}
					transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
					className="text-neutral-400"
				>
					<ChevronIcon className="w-4 h-4" />
				</motion.span>
			</button>

			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						id="what-happens-next-body"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
						className="overflow-hidden border-t border-stroke"
					>
						<ol className="px-6 md:px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
							{STEPS.map((step) => (
								<li key={step.num} className="flex gap-4">
									<div className="font-mono text-[11px] tracking-[0.2em] text-accent mt-0.5 shrink-0">{step.num}</div>
									<div>
										<div className="text-sm text-white tracking-tight">{t(step.titleKey)}</div>
										<p className="text-xs text-neutral-400 mt-1.5 leading-relaxed max-w-[44ch]">{t(step.bodyKey)}</p>
									</div>
								</li>
							))}
						</ol>
					</motion.div>
				) : null}
			</AnimatePresence>
		</section>
	);
}
