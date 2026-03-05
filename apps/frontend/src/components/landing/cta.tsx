"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Link from "next/link";

export default function CTA() {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-80px" });

	return (
		<section className="py-32 px-6 relative" ref={ref}>
			<div className="max-w-4xl mx-auto text-center relative">
				{/* Background glow */}
				<div className="absolute inset-0 -z-10">
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#E8762D]/10 rounded-full blur-[120px]" />
				</div>

				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.8 }}
				>
					<h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
						Ready to deploy
						<br />
						<span className="bg-gradient-to-r from-[#E8762D] to-[#F4A261] bg-clip-text text-transparent">
							your first agent?
						</span>
					</h2>
					<p className="text-lg text-waifufun-text-secondary max-w-lg mx-auto mb-10">
						Join hundreds of operators already running autonomous agents on Solana. Your AI never sleeps.
					</p>

					<Link
						href="/create"
						className="inline-flex items-center gap-2 px-10 py-4 rounded-lg font-bold text-lg bg-[#E8762D] text-white hover:bg-[#c9621f] transition-all duration-300 shadow-[0_0_40px_rgba(232,118,45,0.35)] hover:shadow-[0_0_60px_rgba(232,118,45,0.5)] hover:scale-[1.02] active:scale-[0.98]"
					>
						Launch Your Agent
						<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
						</svg>
					</Link>
				</motion.div>
			</div>
		</section>
	);
}
