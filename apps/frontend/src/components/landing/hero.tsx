"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

function AnimatedCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const start = Date.now();
		const tick = () => {
			const elapsed = Date.now() - start;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			setCount(Math.floor(eased * target));
			if (progress < 1) requestAnimationFrame(tick);
		};
		const timer = setTimeout(tick, 600);
		return () => clearTimeout(timer);
	}, [target, duration]);
	return <>{count.toLocaleString()}</>;
}

function FloatingOrb({ className, delay = 0 }: { className?: string; delay?: number }) {
	return (
		<motion.div
			className={`absolute rounded-full blur-3xl opacity-20 ${className}`}
			animate={{
				y: [0, -30, 0],
				scale: [1, 1.1, 1],
			}}
			transition={{
				duration: 8,
				repeat: Infinity,
				ease: "easeInOut",
				delay,
			}}
		/>
	);
}

export default function Hero() {
	return (
		<section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden -mx-4 -mt-4">
			{/* Gradient orbs */}
			<FloatingOrb className="w-[600px] h-[600px] bg-[#FF6B00] -top-40 -right-40" delay={0} />
			<FloatingOrb className="w-[400px] h-[400px] bg-[#FF6B00]/50 bottom-20 -left-20" delay={2} />
			<FloatingOrb className="w-[300px] h-[300px] bg-cyan-600/20 top-1/2 left-1/3" delay={4} />

			{/* Radial gradient overlay */}
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#0a0a0a_70%)]" />

			{/* Grid pattern */}
			<div
				className="absolute inset-0 opacity-[0.03]"
				style={{
					backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
					backgroundSize: "60px 60px",
				}}
			/>

			<div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
				{/* Badge */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.1 }}
					className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8"
				>
					<span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse" />
					<span className="text-sm text-waifufun-text-secondary tracking-wide">Live on Solana</span>
				</motion.div>

				{/* Main headline */}
				<motion.h1
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, delay: 0.2 }}
					className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6"
				>
					<span className="text-white">Your AI trades</span>
					<br />
					<span className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A3D] bg-clip-text text-transparent">
						while you sleep.
					</span>
				</motion.h1>

				{/* Subtitle */}
				<motion.p
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.4 }}
					className="text-lg sm:text-xl text-waifufun-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
				>
					Launch autonomous AI agents that trade, build skills, and pay their own bills.
					<br className="hidden sm:block" />
					Not chatbots — economic actors on Solana.
				</motion.p>

				{/* CTA buttons */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.6 }}
					className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
				>
					<Link
						href="/create"
						className="group relative px-8 py-3.5 rounded-lg font-semibold text-base bg-[#FF6B00] text-white hover:bg-[#e05a00] transition-all duration-300 shadow-[0_0_30px_rgba(255,107,0,0.3)] hover:shadow-[0_0_50px_rgba(255,107,0,0.5)]"
					>
						Launch Your Agent
						<span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
					</Link>
					<Link
						href="/explore"
						className="px-8 py-3.5 rounded-lg font-semibold text-base border border-white/15 text-white/80 hover:text-white hover:bg-white/5 hover:border-white/25 transition-all duration-300"
					>
						Explore Agents
					</Link>
				</motion.div>

				{/* Stats row */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 0.9 }}
					className="flex items-center justify-center gap-8 sm:gap-16"
				>
					{[
						{ label: "Agents Live", value: 127 },
						{ label: "Total Volume", value: 2400000, prefix: "$", suffix: "" },
						{ label: "Avg. Daily Return", value: 12, suffix: "%" },
					].map((stat) => (
						<div key={stat.label} className="text-center">
							<div className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
								{stat.prefix}
								<AnimatedCounter target={stat.value} />
								{stat.suffix}
							</div>
							<div className="text-xs sm:text-sm text-waifufun-text-secondary mt-1">{stat.label}</div>
						</div>
					))}
				</motion.div>
			</div>

			{/* Bottom fade */}
			<div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
		</section>
	);
}
