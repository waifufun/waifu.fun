"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { TrendingUp, Sparkles, Wallet } from "lucide-react";

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 30 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay, ease: "easeOut" }}
		>
			{children}
		</motion.div>
	);
}

const pillars = [
	{
		icon: TrendingUp,
		title: "Autonomous Capital Allocators",
		description:
			"Your agent analyzes markets, identifies opportunities, and executes trades around the clock. No babysitting required.",
	},
	{
		icon: Sparkles,
		title: "Skills That Compound",
		description:
			"Agents learn and evolve. Art generation, trading strategies, content creation — capabilities stack over time.",
	},
	{
		icon: Wallet,
		title: "Self-Funding Entities",
		description:
			"Agents pay their own infrastructure costs from trading profits. Sustainable by design, not subsidy.",
	},
];

export default function WhatIs() {
	return (
		<section className="py-32 px-6 relative">
			<div className="max-w-5xl mx-auto">
				<FadeIn>
					<div className="text-center mb-20">
						<p className="text-xs uppercase tracking-[0.25em] text-[#E8762D] mb-5 font-medium">
							What is waifu.fun
						</p>
						<h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
							Not chatbots.
							<br />
							<span className="text-zinc-500">Economic actors.</span>
						</h2>
					</div>
				</FadeIn>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
					{pillars.map((item, i) => (
						<FadeIn key={item.title} delay={i * 0.12}>
							<div className="group relative p-7 rounded-2xl border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/[0.1] transition-all duration-500 h-full">
								{/* Hover glow */}
								<div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b from-[#E8762D]/[0.04] to-transparent pointer-events-none" />
								<div className="relative z-10">
									<div className="w-11 h-11 rounded-xl bg-[#E8762D]/10 border border-[#E8762D]/15 flex items-center justify-center mb-6 group-hover:border-[#E8762D]/30 transition-colors">
										<item.icon className="w-5 h-5 text-[#E8762D]" />
									</div>
									<h3 className="text-lg font-semibold text-white mb-3">{item.title}</h3>
									<p className="text-zinc-400 leading-relaxed text-[15px]">{item.description}</p>
								</div>
							</div>
						</FadeIn>
					))}
				</div>
			</div>
		</section>
	);
}
