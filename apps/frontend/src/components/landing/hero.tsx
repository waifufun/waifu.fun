"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

export default function Hero() {
	const [glitchActive, setGlitchActive] = useState(false);
	
	// Mouse parallax effect
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);
	
	const springConfig = { damping: 25, stiffness: 150 };
	const x = useSpring(mouseX, springConfig);
	const y = useSpring(mouseY, springConfig);
	
	const rotateX = useTransform(y, [-0.5, 0.5], [5, -5]);
	const rotateY = useTransform(x, [-0.5, 0.5], [-5, 5]);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			const { clientX, clientY, currentTarget } = e;
			const target = currentTarget as HTMLElement;
			const { width, height, left, top } = target.getBoundingClientRect();
			
			const xPct = (clientX - left) / width - 0.5;
			const yPct = (clientY - top) / height - 0.5;
			
			mouseX.set(xPct);
			mouseY.set(yPct);
		};

		document.addEventListener('mousemove', handleMouseMove);
		return () => document.removeEventListener('mousemove', handleMouseMove);
	}, [mouseX, mouseY]);
	
	// Trigger random glitch effect
	useEffect(() => {
		const interval = setInterval(() => {
			if (Math.random() > 0.85) {
				setGlitchActive(true);
				setTimeout(() => setGlitchActive(false), 200);
			}
		}, 3000);
		
		return () => clearInterval(interval);
	}, []);

	return (
		<section className="relative min-h-[95vh] flex items-center justify-center overflow-hidden -mx-4 -mt-4">
			{/* Distorted background orbs */}
			<motion.div
				className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-[0.12]"
				style={{
					background: 'radial-gradient(circle, hsl(270, 50%, 55%) 0%, transparent 70%)',
					top: '-15%',
					right: '-10%',
					rotateX,
					rotateY,
				}}
				animate={{
					scale: [1, 1.1, 1],
					opacity: [0.12, 0.15, 0.12],
				}}
				transition={{
					duration: 8,
					repeat: Infinity,
					ease: "easeInOut",
				}}
			/>
			
			<motion.div
				className="absolute w-[400px] h-[400px] rounded-full blur-3xl opacity-[0.1]"
				style={{
					background: 'radial-gradient(circle, hsl(180, 40%, 65%) 0%, transparent 70%)',
					bottom: '10%',
					left: '-5%',
				}}
				animate={{
					scale: [1, 1.05, 1],
					x: [0, 20, 0],
					opacity: [0.1, 0.12, 0.1],
				}}
				transition={{
					duration: 10,
					repeat: Infinity,
					ease: "easeInOut",
					delay: 2,
				}}
			/>
			
			<motion.div
				className="absolute w-[300px] h-[300px] rounded-full blur-3xl opacity-[0.08]"
				style={{
					background: 'radial-gradient(circle, hsl(330, 45%, 60%) 0%, transparent 70%)',
					top: '30%',
					right: '20%',
				}}
				animate={{
					y: [0, -30, 0],
					scale: [1, 1.08, 1],
				}}
				transition={{
					duration: 12,
					repeat: Infinity,
					ease: "easeInOut",
					delay: 4,
				}}
			/>

			{/* Radial vignette */}
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#0a0a0a_80%)]" />

			{/* Broken grid overlay */}
			<div
				className="absolute inset-0 opacity-[0.018]"
				style={{
					backgroundImage: `linear-gradient(rgba(232,232,232,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(232,232,232,0.15) 1px, transparent 1px)`,
					backgroundSize: "60px 60px",
					transform: 'skewY(-2deg)',
				}}
			/>

			<div className="relative z-10 max-w-5xl mx-auto px-6">
				{/* Badge - offset for asymmetry */}
				<motion.div
					initial={{ opacity: 0, x: -20 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.6, delay: 0.1, type: "spring", damping: 20 }}
					className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-waifufun-stroke-primary bg-waifufun-background-card/30 backdrop-blur-sm mb-16 -ml-2"
				>
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-waifufun-neon-purple opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-waifufun-neon-purple" />
					</span>
					<span className="text-[11px] text-waifufun-text-secondary tracking-widest uppercase font-mono">
						LIVE_MAINNET
					</span>
				</motion.div>

				{/* Main headline - with glitch effect */}
				<div className="mb-8 relative">
					<motion.h1
						initial={{ opacity: 0, y: 40 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.9, delay: 0.2, type: "spring", damping: 25 }}
						className={`text-[clamp(3rem,10vw,7rem)] font-bold tracking-[-0.03em] leading-[0.95] ${glitchActive ? 'animate-glitch-text' : ''}`}
						style={{
							fontVariantNumeric: 'lining-nums',
						}}
					>
						<span className="block text-waifufun-text-primary mb-2">
							Autonomous agents
						</span>
						<span className="block">
							<span className="text-waifufun-text-secondary">that </span>
							<span 
								className="relative inline-block animate-glow-pulse"
								style={{
									background: 'linear-gradient(120deg, hsl(270, 50%, 55%), hsl(330, 45%, 60%), hsl(180, 40%, 65%))',
									WebkitBackgroundClip: 'text',
									WebkitTextFillColor: 'transparent',
									backgroundClip: 'text',
								}}
							>
								build wealth
							</span>
						</span>
					</motion.h1>
					
					{/* Glitch clone layers (subtle data corruption effect) */}
					{glitchActive && (
						<>
							<div 
								className="absolute inset-0 text-[clamp(3rem,10vw,7rem)] font-bold tracking-[-0.03em] leading-[0.95] opacity-50 text-waifufun-neon-cyan"
								style={{ transform: 'translate(-2px, -2px)', mixBlendMode: 'screen' }}
							>
								<span className="block mb-2">Autonomous agents</span>
								<span className="block"><span className="text-transparent">that </span>build wealth</span>
							</div>
							<div 
								className="absolute inset-0 text-[clamp(3rem,10vw,7rem)] font-bold tracking-[-0.03em] leading-[0.95] opacity-50 text-waifufun-neon-pink"
								style={{ transform: 'translate(2px, 2px)', mixBlendMode: 'screen' }}
							>
								<span className="block mb-2">Autonomous agents</span>
								<span className="block"><span className="text-transparent">that </span>build wealth</span>
							</div>
						</>
					)}
				</div>

				{/* Subtitle - broken into chunks for asymmetry */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.7, delay: 0.5, type: "spring", damping: 20 }}
					className="max-w-2xl mb-14 space-y-2"
				>
					<p className="text-lg text-waifufun-text-primary font-light leading-relaxed">
						Not chatbots. Economic actors.
					</p>
					<p className="text-base text-waifufun-text-secondary font-light leading-relaxed pl-8">
						Deploy AI that trades, learns, and pays its own bills while you sleep.
					</p>
				</motion.div>

				{/* CTA buttons - staggered entry */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.6, delay: 0.7 }}
					className="flex flex-col sm:flex-row items-start gap-4 mb-20"
				>
					<motion.div
						whileHover={{ scale: 1.02, y: -2 }}
						whileTap={{ scale: 0.98 }}
						transition={{ type: "spring", damping: 15 }}
					>
						<Link
							href="/create"
							className="group relative flex items-center gap-2.5 px-7 py-3.5 rounded-lg font-medium text-sm bg-waifufun-text-primary text-waifufun-background-primary hover:bg-waifufun-text-secondary transition-colors duration-200 overflow-hidden"
						>
							<span className="relative z-10">Deploy Agent</span>
							<ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
							
							{/* Subtle hover glow */}
							<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-waifufun-neon-purple/10 to-waifufun-neon-cyan/10" />
						</Link>
					</motion.div>
					
					<motion.div
						whileHover={{ scale: 1.02, y: -2 }}
						whileTap={{ scale: 0.98 }}
						transition={{ type: "spring", damping: 15 }}
					>
						<Link
							href="/explore"
							className="flex items-center gap-2.5 px-7 py-3.5 rounded-lg font-medium text-sm border border-waifufun-stroke-primary text-waifufun-text-secondary hover:text-waifufun-text-primary hover:border-waifufun-stroke-highlight/50 hover:bg-waifufun-background-card/30 transition-all duration-200 backdrop-blur-sm"
						>
							View Live Agents
						</Link>
					</motion.div>
				</motion.div>

				{/* Stats - asymmetric layout with monospace */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 1, delay: 1 }}
					className="flex flex-wrap gap-x-8 gap-y-4 text-xs font-mono"
				>
					<div className="flex flex-col gap-0.5">
						<span className="text-waifufun-text-primary text-base font-medium tabular-nums">127</span>
						<span className="text-waifufun-text-secondary uppercase tracking-wider">ACTIVE_AGENTS</span>
					</div>
					<div className="h-12 w-px bg-waifufun-stroke-primary opacity-30" />
					<div className="flex flex-col gap-0.5">
						<span className="text-waifufun-text-primary text-base font-medium tabular-nums">$2.4M</span>
						<span className="text-waifufun-text-secondary uppercase tracking-wider">24H_VOLUME</span>
					</div>
					<div className="h-12 w-px bg-waifufun-stroke-primary opacity-30" />
					<div className="flex flex-col gap-0.5">
						<span className="text-waifufun-neon-green text-base font-medium tabular-nums">+12.3%</span>
						<span className="text-waifufun-text-secondary uppercase tracking-wider">AVG_RETURN</span>
					</div>
				</motion.div>
			</div>

			{/* Bottom gradient fade */}
			<div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-waifufun-background-primary to-transparent" />
		</section>
	);
}
