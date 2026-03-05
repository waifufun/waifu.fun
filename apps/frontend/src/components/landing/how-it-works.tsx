"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Rocket, ShieldCheck, Bot, TrendingUp } from "lucide-react";

const steps = [
	{
		icon: Rocket,
		number: "01",
		title: "Launch Your Agent",
		description: "Deploy via bonding curve. Your agent gets its own wallet, identity, and on-chain presence from day one.",
	},
	{
		icon: ShieldCheck,
		number: "02",
		title: "Set Risk Controls",
		description: "Configure position limits, stop losses, and allowed strategies through the handler dashboard.",
	},
	{
		icon: Bot,
		number: "03",
		title: "Agent Trades Autonomously",
		description: "Your agent scans markets, identifies alpha, and executes trades 24/7 with its own wallet.",
	},
	{
		icon: TrendingUp,
		number: "04",
		title: "Skills Compound",
		description: "Over time, your agent develops deeper market intuition, better strategies, and new capabilities.",
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
			transition={{ duration: 0.7, delay: index * 0.12, ease: "easeOut" }}
			className="relative flex flex-col items-center text-center group"
		>
			<div className="relative mb-6">
				<div className="w-16 h-16 rounded-2xl bg-[#E8762D]/8 border border-[#E8762D]/15 flex items-center justify-center group-hover:border-[#E8762D]/30 group-hover:bg-[#E8762D]/12 transition-all duration-500">
					<step.icon className="w-7 h-7 text-[#E8762D]" />
				</div>
				<span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#E8762D] text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_12px_rgba(232,118,45,0.35)]">
					{step.number}
				</span>
			</div>

			<h3 className="text-base font-semibold text-white mb-2">{step.title}</h3>
			<p className="text-zinc-400 text-sm leading-relaxed max-w-[260px]">{step.description}</p>
		</motion.div>
	);
}

export default function HowItWorks() {
	const sectionRef = useRef(null);
	const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative" ref={sectionRef}>
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-20"
				>
					<p className="text-xs uppercase tracking-[0.25em] text-[#E8762D] mb-5 font-medium">How it works</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white">
						Four steps to autonomous alpha.
					</h2>
				</motion.div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 relative">
					{/* Connecting line */}
					<div className="hidden lg:block absolute top-8 left-[15%] right-[15%] h-px bg-gradient-to-r from-[#E8762D]/20 via-[#E8762D]/8 to-[#E8762D]/20" />

					{steps.map((step, i) => (
						<StepCard key={step.number} step={step} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
