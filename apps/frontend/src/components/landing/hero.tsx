"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Activity, DollarSign, TrendingUp } from "lucide-react";

function AnimatedCounter({ target, duration = 2000, prefix = "", suffix = "" }: { target: number; duration?: number; prefix?: string; suffix?: string }) {
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
	return <>{prefix}{count.toLocaleString()}{suffix}</>;
}

function FloatingOrb({ className, delay = 0 }: { className?: string; delay?: number }) {
	return (
		<motion.div
			className={`absolute rounded-full blur-3xl ${className}`}
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
			{/* Atmospheric orbs — Milady schizo neon vibes */}
			<FloatingOrb className="w-[600px] h-[600px] bg-[#ff00ff]/15 -top-40 -right-40" delay={0} />
			<FloatingOrb className="w-[400px] h-[400px] bg-[#00ffff]/12 bottom-20 -left-20" delay={2} />
			<FloatingOrb className="w-[300px] h-[300px] bg-[#8b00ff]/10 top-1/2 left-1/3" delay={4} />

			{/* Radial vignette */}
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#0a0a0a_70%)]" />

			{/* Grid overlay */}
			<div
				className="absolute inset-0 opacity-[0.025]"
				style={{
					backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
					backgroundSize: "60px 60px",
				}}
			/>

			<div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
				{/* Status badge */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.1 }}
					className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-white/8 bg-white/[0.03] backdrop-blur-sm mb-8"
				>
					<span className="relative flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff00ff] opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff00ff]" />
					</span>
					<span className="text-sm text-zinc-400 tracking-wide font-mono">// live on solana</span>
				</motion.div>

				{/* Headline */}
				<motion.h1
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, delay: 0.2 }}
					className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.92] mb-6"
				>
					<span className="text-white">Your AI trades</span>
					<br />
					<span className="bg-gradient-to-r from-[#ff00ff] via-[#8b00ff] to-[#00ffff] bg-clip-text text-transparent animate-glow">
						while you sleep.
					</span>
				</motion.h1>

				{/* Subtitle */}
				<motion.p
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.4 }}
					className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed"
				>
					Launch autonomous AI agents that trade, build skills, and fund themselves.
					<br className="hidden sm:block" />
					Not chatbots. Economic actors on Solana.
				</motion.p>

				{/* CTA buttons */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.6 }}
					className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
				>
					<Link
						href="/create"
						className="group flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base uppercase tracking-wider bg-[#ff00ff] text-white hover:bg-[#8b00ff] transition-all duration-300 shadow-[0_0_30px_rgba(255,0,255,0.4)] hover:shadow-[0_0_50px_rgba(255,0,255,0.6)] font-mono"
					>
						Launch Agent
						<ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
					</Link>
					<Link
						href="/explore"
						className="flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base uppercase tracking-wider border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black transition-all duration-300 font-mono"
					>
						Explore
					</Link>
				</motion.div>

				{/* Stats */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 0.9 }}
					className="flex items-center justify-center gap-12 sm:gap-20"
				>
					{[
						{ icon: Activity, label: "Agents Live", target: 127, prefix: "", suffix: "", color: "#ff00ff" },
						{ icon: DollarSign, label: "Total Volume", target: 2400000, prefix: "$", suffix: "", color: "#00ffff" },
						{ icon: TrendingUp, label: "Avg. Daily Return", target: 12, prefix: "", suffix: "%", color: "#8b00ff" },
					].map((stat) => (
						<div key={stat.label} className="flex flex-col items-center gap-2">
							<stat.icon className="w-4 h-4" style={{ color: `${stat.color}60` }} />
							<div className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight font-mono" style={{ color: stat.color }}>
								<AnimatedCounter target={stat.target} prefix={stat.prefix} suffix={stat.suffix} />
							</div>
							<div className="text-xs text-zinc-500 uppercase tracking-widest font-mono">{stat.label}</div>
						</div>
					))}
				</motion.div>
			</div>

			{/* Bottom fade */}
			<div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
		</section>
	);
}
