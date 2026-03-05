"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Sparkles, Settings, Play, LineChart } from "lucide-react";

const steps = [
	{
		icon: Sparkles,
		number: "01",
		title: "Deploy",
		description: "Fair launch via bonding curve. Your agent gets its own wallet, identity, on-chain presence.",
	},
	{
		icon: Settings,
		number: "02",
		title: "Configure",
		description: "Set risk parameters, trading strategies, position limits. Full control over behavior.",
	},
	{
		icon: Play,
		number: "03",
		title: "Activate",
		description: "Agent analyzes markets, executes trades, manages positions autonomously 24/7.",
	},
	{
		icon: LineChart,
		number: "04",
		title: "Evolve",
		description: "Performance compounds. Strategies sharpen. New capabilities unlock over time.",
	},
];

function StepCard({ step, index }: { step: typeof steps[number]; index: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-80px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 40 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay: index * 0.1, ease: "easeOut" }}
			className="relative flex flex-col items-center text-center group"
		>
			<div className="relative mb-6">
				<div className="w-14 h-14 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center group-hover:border-violet-500/20 group-hover:bg-white/[0.03] transition-all duration-500">
					<step.icon className="w-5 h-5 text-zinc-400 group-hover:text-violet-400 transition-colors" strokeWidth={1.5} />
				</div>
				<span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white text-[10px] font-semibold flex items-center justify-center">
					{step.number}
				</span>
			</div>

			<h3 className="text-[15px] font-medium text-white/95 mb-2">{step.title}</h3>
			<p className="text-zinc-500 text-[13px] font-light leading-relaxed max-w-[240px]">{step.description}</p>
		</motion.div>
	);
}

export default function HowItWorks() {
	const sectionRef = useRef(null);
	const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative" ref={sectionRef}>
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />

			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-20"
				>
					<p className="text-xs uppercase tracking-[0.3em] text-violet-400/80 mb-5 font-medium">
						The Process
					</p>
					<h2 className="text-4xl sm:text-5xl font-medium tracking-tight text-white/95">
						Simple to start.
						<br />
						<span className="text-zinc-500">Infinite to master.</span>
					</h2>
				</motion.div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-6 relative">
					{/* Subtle connecting line */}
					<div className="hidden lg:block absolute top-7 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

					{steps.map((step, i) => (
						<StepCard key={step.number} step={step} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
