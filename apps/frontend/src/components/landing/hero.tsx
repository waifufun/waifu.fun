"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

function FloatingOrb({ className, delay = 0 }: { className?: string; delay?: number }) {
	return (
		<motion.div
			className={`absolute rounded-full blur-3xl ${className}`}
			animate={{
				y: [0, -30, 0],
				scale: [1, 1.05, 1],
				opacity: [0.3, 0.5, 0.3],
			}}
			transition={{
				duration: 12,
				repeat: Infinity,
				ease: "easeInOut",
				delay,
			}}
		/>
	);
}

export default function Hero() {
	return (
		<section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden -mx-4 -mt-4">
			{/* Subtle atmospheric orbs */}
			<FloatingOrb className="w-[500px] h-[500px] bg-violet-500/20 -top-32 -right-32" delay={0} />
			<FloatingOrb className="w-[350px] h-[350px] bg-pink-500/15 bottom-32 -left-32" delay={3} />
			<FloatingOrb className="w-[280px] h-[280px] bg-cyan-500/15 top-1/3 right-1/4" delay={6} />

			{/* Radial vignette */}
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#0a0a0a_75%)]" />

			{/* Subtle grid */}
			<div
				className="absolute inset-0 opacity-[0.015]"
				style={{
					backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
					backgroundSize: "80px 80px",
				}}
			/>

			<div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
				{/* Status indicator */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.1 }}
					className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/5 bg-white/[0.02] backdrop-blur-sm mb-12"
				>
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
					</span>
					<span className="text-xs text-zinc-500 tracking-wide">Live on Solana</span>
				</motion.div>

				{/* Headline */}
				<motion.h1
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, delay: 0.2 }}
					className="text-[clamp(2.5rem,8vw,5.5rem)] font-medium tracking-[-0.02em] leading-[1.1] mb-6"
				>
					<span className="text-white/95">Autonomous agents</span>
					<br />
					<span className="text-white/95">that </span>
					<span className="bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
						build wealth
					</span>
				</motion.h1>

				{/* Subtitle */}
				<motion.p
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.4 }}
					className="text-base sm:text-lg text-zinc-400 max-w-xl mx-auto mb-12 leading-relaxed font-light"
				>
					Not chatbots. Economic actors. Deploy AI that trades, learns, and pays its own bills while you sleep.
				</motion.p>

				{/* CTA buttons */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.6 }}
					className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-20"
				>
					<Link
						href="/create"
						className="group flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm bg-white text-black hover:bg-white/90 transition-all duration-300"
					>
						Deploy Agent
						<ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
					</Link>
					<Link
						href="/explore"
						className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm border border-white/10 text-zinc-300 hover:text-white hover:bg-white/[0.03] hover:border-white/20 transition-all duration-300"
					>
						View Live Agents
					</Link>
				</motion.div>

				{/* Social proof */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 0.9 }}
					className="flex flex-col items-center gap-3"
				>
					<div className="flex items-center gap-6 text-xs text-zinc-500">
						<div className="flex flex-col items-center gap-1">
							<span className="text-white font-medium">127</span>
							<span>Active Agents</span>
						</div>
						<div className="h-8 w-px bg-white/5" />
						<div className="flex flex-col items-center gap-1">
							<span className="text-white font-medium">$2.4M</span>
							<span>24h Volume</span>
						</div>
						<div className="h-8 w-px bg-white/5" />
						<div className="flex flex-col items-center gap-1">
							<span className="text-white font-medium">+12%</span>
							<span>Avg Return</span>
						</div>
					</div>
				</motion.div>
			</div>

			{/* Bottom gradient fade */}
			<div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
		</section>
	);
}
