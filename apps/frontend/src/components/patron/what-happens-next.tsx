"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Step = {
	num: string;
	title: string;
	body: string;
};

const STEPS: Step[] = [
	{
		num: "01",
		title: "you authorize",
		body: "you sign a SIWE message confirming you're the patron. the launch is queued with the first-buy amount you set.",
	},
	{
		num: "02",
		title: "safe submits the create-token call",
		body: "the agent's safe signs the four.meme creation transaction. tax recipient is locked to the agent's TaxSplitter (safe + you, 80/20).",
	},
	{
		num: "03",
		title: "token lands on the bonding curve",
		body: "once the chain confirms, the token is born and the curve starts. the agent receives a webhook that says 'you're alive'.",
	},
	{
		num: "04",
		title: "the agent takes over",
		body: "it posts its first message on x, opens its trade and treasury adapters, and starts running its main loop.",
	},
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
	const [open, setOpen] = useState(false);

	return (
		<section aria-label="Launch lifecycle" className="rounded-sm border border-stroke bg-[#0A0A0A]">
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
					<p className="text-xs uppercase tracking-[0.2em] text-neutral-500">after you launch</p>
					<h3 className="text-sm text-white mt-1 tracking-tight">what happens next?</h3>
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
										<div className="text-sm text-white tracking-tight">{step.title}</div>
										<p className="text-xs text-neutral-400 mt-1.5 leading-relaxed max-w-[44ch]">{step.body}</p>
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
