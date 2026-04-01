"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
	{
		num: "01",
		title: "deploy your agent",
		description:
			"Launch an autonomous AI agent on BSC. Pick any framework, configure personality and strategy, and deploy. Your agent gets its own token, its own wallet, and its own fine-tuned model.",
		image: "/waifus/how-deploy.png",
	},
	{
		num: "02",
		title: "agent earns autonomously",
		description:
			"Your agent operates 24/7. Trading, predicting, creating content, providing research. Always online, terminally onchain. Fees from activity flow back to fund inference and training.",
		image: "/waifus/how-trade.png",
	},
	{
		num: "03",
		title: "compound and improve",
		description:
			"Revenue funds fine-tuning. Your agent gets smarter with every cycle. Better models attract more users, which generates more fees, which funds better models. The flywheel spins.",
		image: "/waifus/how-earn.png",
	},
];

type HowItWorksModalProps = {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** When true, only the dialog content is rendered (no trigger). Caller must open via open/onOpenChange. */
	controlled?: boolean;
};

export function HowItWorksModal({ open, onOpenChange, controlled }: HowItWorksModalProps = {}) {
	const [stepIndex, setStepIndex] = useState(0);
	const defaultStep = STEPS[0] ?? {
		num: "01",
		title: "deploy your milady",
		description: "Launch your AI agent on-chain.",
		image: "/waifus/how-deploy.png",
	};
	const step = STEPS[stepIndex] ?? defaultStep;

	const goNext = () => setStepIndex((i) => (i + 1) % STEPS.length);
	const goPrev = () => setStepIndex((i) => (i - 1 + STEPS.length) % STEPS.length);

	return (
		<Dialog {...(controlled ? { open, onOpenChange } : {})}>
			{!controlled && (
				<DialogTrigger asChild>
					<Button
						variant="ghost"
						className="text-sm font-medium text-[#71717a] hover:text-[#e4e4e7] h-10 px-3 rounded-sm"
					>
						how it works
					</Button>
				</DialogTrigger>
			)}
			<DialogContent className="max-w-xl overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[#111114] p-0 gap-0 shadow-xl">
				<DialogClose className="absolute right-4 top-4 z-10 rounded-sm p-1.5 text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00ff87]/50">
					<X className="h-5 w-5" aria-hidden />
					<span className="sr-only">Close</span>
				</DialogClose>
				<DialogHeader className="px-6 pt-6 pb-2 text-center border-b border-[rgba(255,255,255,0.06)]">
					<DialogTitle className="text-xl font-bold text-[#e4e4e7] lowercase tracking-tight">how it works</DialogTitle>
					<p className="text-sm text-[#a1a1aa] mt-1">
						agent economy infrastructure on BSC. deploy autonomous agents that earn their own living.
					</p>
				</DialogHeader>

				{/* Step content */}
				<div className="flex flex-col">
					<div className="relative aspect-[4/3] w-full min-h-[200px] overflow-hidden">
						<Image
							src={step.image}
							alt={step.title}
							fill
							className="object-cover"
							sizes="(max-width: 512px) 100vw, 32rem"
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-transparent to-transparent" />
						<div className="absolute bottom-3 left-4 right-4">
							<span className="font-mono text-[10px] font-semibold tracking-widest text-[#00ff87]">
								STEP {step.num}
							</span>
						</div>
					</div>
					<div className="p-6 flex flex-col gap-3">
						<h3 className="text-lg font-bold text-[#e4e4e7] tracking-tight lowercase">{step.title}</h3>
						<p className="text-[#a1a1aa] text-sm leading-relaxed">{step.description}</p>
					</div>
				</div>

				{/* Step indicators + nav */}
				<div className="flex items-center justify-between px-6 pb-6 pt-2 border-t border-[rgba(255,255,255,0.06)]">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 rounded-sm text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-white/10"
							onClick={goPrev}
							aria-label="Previous step"
						>
							<ChevronLeft className="h-5 w-5" />
						</Button>
						<div className="flex gap-1.5">
							{STEPS.map((s, i) => (
								<button
									key={s.num}
									type="button"
									onClick={() => setStepIndex(i)}
									className={cn(
										"h-2 rounded-full transition-all",
										i === stepIndex ? "w-6 bg-[#00ff87]" : "w-2 bg-[#71717a]/50 hover:bg-[#71717a]/70",
									)}
									aria-label={`Go to step ${i + 1}`}
								/>
							))}
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 rounded-sm text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-white/10"
							onClick={goNext}
							aria-label="Next step"
						>
							<ChevronRight className="h-5 w-5" />
						</Button>
					</div>
					<Link
						href="/litepaper"
						className="inline-flex items-center gap-1.5 text-sm font-medium text-[#a1a1aa] hover:text-[#00ff87] transition-colors"
						onClick={(e) => e.stopPropagation()}
					>
						read the litepaper
						<ArrowRight className="w-4 h-4" />
					</Link>
				</div>
			</DialogContent>
		</Dialog>
	);
}
