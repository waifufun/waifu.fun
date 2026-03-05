"use client";

import { motion, useInView } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";

export default function CTA() {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative">
			<div className="max-w-3xl mx-auto">
				<motion.div
					ref={ref}
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.8 }}
					className="relative p-12 sm:p-16 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden"
				>
					{/* Subtle glow */}
					<div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent opacity-60" />
					
					{/* Grid pattern */}
					<div
						className="absolute inset-0 opacity-[0.015]"
						style={{
							backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
							backgroundSize: "40px 40px",
						}}
					/>

					<div className="relative z-10 text-center">
						<h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-white/95 leading-[1.15] mb-6">
							Ready to deploy?
						</h2>
						<p className="text-zinc-400 text-base sm:text-lg font-light mb-10 max-w-xl mx-auto">
							Launch your autonomous agent in minutes. Fair launch, no gatekeepers.
						</p>

						<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
							<Link
								href="/create"
								className="group flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm bg-white text-black hover:bg-white/90 transition-all duration-300"
							>
								Launch Agent
								<ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
							</Link>
							<Link
								href="https://docs.waifu.fun"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm border border-white/10 text-zinc-300 hover:text-white hover:bg-white/[0.03] hover:border-white/20 transition-all duration-300"
							>
								Read Docs
							</Link>
						</div>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
