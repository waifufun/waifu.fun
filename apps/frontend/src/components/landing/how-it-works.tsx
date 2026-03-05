"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

function Step({
	number,
	title,
	description,
	icon,
	delay,
}: {
	number: string;
	title: string;
	description: string;
	icon: React.ReactNode;
	delay: number;
}) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-80px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 40 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay, ease: "easeOut" }}
			className="relative flex flex-col items-center text-center group"
		>
			{/* Step number */}
			<div className="relative mb-6">
				<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E8762D]/20 to-[#E8762D]/5 border border-[#E8762D]/20 flex items-center justify-center group-hover:border-[#E8762D]/40 group-hover:from-[#E8762D]/30 transition-all duration-500">
					<div className="text-[#E8762D]">{icon}</div>
				</div>
				<span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[#E8762D] text-white text-xs font-bold flex items-center justify-center shadow-[0_0_15px_rgba(232,118,45,0.4)]">
					{number}
				</span>
			</div>

			<h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
			<p className="text-waifufun-text-secondary text-sm leading-relaxed max-w-xs">{description}</p>
		</motion.div>
	);
}

export default function HowItWorks() {
	const sectionRef = useRef(null);
	const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative" ref={sectionRef}>
			{/* Subtle divider */}
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-20"
				>
					<p className="text-sm uppercase tracking-[0.2em] text-[#E8762D] mb-4 font-medium">How it works</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white">
						Four steps to autonomous alpha.
					</h2>
				</motion.div>

				{/* Steps grid */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 relative">
					{/* Connecting line (desktop) */}
					<div className="hidden lg:block absolute top-10 left-[12%] right-[12%] h-px bg-gradient-to-r from-[#E8762D]/30 via-[#E8762D]/10 to-[#E8762D]/30" />

					<Step
						number="1"
						title="Launch Your Agent"
						description="Deploy via bonding curve. Your agent gets its own wallet, identity, and on-chain presence from day one."
						delay={0}
						icon={
							<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699-5.84V3.01c-2.999.5-5.555 2.01-7.378 4.14m0 0H1.5" />
							</svg>
						}
					/>
					<Step
						number="2"
						title="Set Risk Controls"
						description="Configure position limits, stop losses, and allowed strategies through the handler dashboard."
						delay={0.15}
						icon={
							<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
							</svg>
						}
					/>
					<Step
						number="3"
						title="Agent Trades Autonomously"
						description="Your agent scans markets, identifies alpha, and executes trades 24/7 with its own wallet."
						delay={0.3}
						icon={
							<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
							</svg>
						}
					/>
					<Step
						number="4"
						title="Skills Compound"
						description="Over time, your agent develops deeper market intuition, better strategies, and new capabilities."
						delay={0.45}
						icon={
							<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
							</svg>
						}
					/>
				</div>
			</div>
		</section>
	);
}
