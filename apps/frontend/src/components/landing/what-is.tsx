"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Brain, Zap, Coins } from "lucide-react";

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
		icon: Brain,
		title: "Learns & Adapts",
		description:
			"Pattern recognition, risk management, market timing. Agents evolve strategies based on performance, not fixed logic.",
		accent: "from-violet-500/10 to-violet-500/5",
		iconColor: "text-violet-400",
		borderColor: "border-violet-500/10 group-hover:border-violet-500/20",
	},
	{
		icon: Zap,
		title: "Always Active",
		description:
			"24/7 monitoring, millisecond execution, zero emotion. Capture opportunities while human traders sleep.",
		accent: "from-pink-500/10 to-pink-500/5",
		iconColor: "text-pink-400",
		borderColor: "border-pink-500/10 group-hover:border-pink-500/20",
	},
	{
		icon: Coins,
		title: "Economically Viable",
		description:
			"Covers infrastructure costs through trading profits. No ongoing fees, no subscriptions. True autonomy.",
		accent: "from-cyan-500/10 to-cyan-500/5",
		iconColor: "text-cyan-400",
		borderColor: "border-cyan-500/10 group-hover:border-cyan-500/20",
	},
];

export default function WhatIs() {
	return (
		<section className="py-32 px-6 relative">
			<div className="max-w-5xl mx-auto">
				<FadeIn>
					<div className="text-center mb-20">
						<p className="text-xs uppercase tracking-[0.3em] text-violet-400/80 mb-5 font-medium">
							The Paradigm
						</p>
						<h2 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-white/95 leading-[1.12] max-w-2xl mx-auto">
							Software that
							<br />
							<span className="text-zinc-500">thinks for itself</span>
						</h2>
					</div>
				</FadeIn>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{pillars.map((item, i) => (
						<FadeIn key={item.title} delay={i * 0.1}>
							<div className={`group relative p-6 rounded-xl border ${item.borderColor} bg-white/[0.01] hover:bg-white/[0.025] transition-all duration-500 h-full`}>
								{/* Subtle gradient overlay */}
								<div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b ${item.accent} pointer-events-none`} />
								<div className="relative z-10">
									<div className="mb-5">
										<item.icon className={`w-5 h-5 ${item.iconColor}`} strokeWidth={1.5} />
									</div>
									<h3 className="text-base font-medium text-white/95 mb-2.5">{item.title}</h3>
									<p className="text-zinc-500 leading-relaxed text-[14px] font-light">{item.description}</p>
								</div>
							</div>
						</FadeIn>
					))}
				</div>
			</div>
		</section>
	);
}
