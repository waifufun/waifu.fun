"use client";

import { motion } from "motion/react";
import { useInView } from "motion/react";
import { useRef } from "react";

function FadeInWhenVisible({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
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

export default function WhatIs() {
	return (
		<section className="py-32 px-6 relative">
			<div className="max-w-5xl mx-auto">
				<FadeInWhenVisible>
					<div className="text-center mb-20">
						<p className="text-sm uppercase tracking-[0.2em] text-[#FF6B00] mb-4 font-medium">
							What is waifu.fun
						</p>
						<h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
							Not chatbots.
							<br />
							<span className="text-waifufun-text-secondary">Economic actors.</span>
						</h2>
					</div>
				</FadeInWhenVisible>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{[
						{
							icon: (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
								</svg>
							),
							title: "Autonomous Capital Allocators",
							description:
								"Your agent analyzes markets, identifies opportunities, and executes trades 24/7. No babysitting required.",
						},
						{
							icon: (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
								</svg>
							),
							title: "Skills That Compound",
							description:
								"Agents learn and evolve. Art generation, trading strategies, content creation — capabilities stack over time.",
						},
						{
							icon: (
								<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
								</svg>
							),
							title: "Self-Funding Entities",
							description:
								"Agents pay their own infrastructure costs from trading profits. Sustainable by design, not subsidy.",
						},
					].map((item, i) => (
						<FadeInWhenVisible key={item.title} delay={i * 0.15}>
							<div className="group relative p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500">
								{/* Hover glow */}
								<div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b from-[#FF6B00]/5 to-transparent" />
								<div className="relative z-10">
									<div className="w-12 h-12 rounded-xl bg-[#FF6B00]/10 border border-[#FF6B00]/20 flex items-center justify-center text-[#FF6B00] mb-6">
										{item.icon}
									</div>
									<h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
									<p className="text-waifufun-text-secondary leading-relaxed text-[15px]">{item.description}</p>
								</div>
							</div>
						</FadeInWhenVisible>
					))}
				</div>
			</div>
		</section>
	);
}
