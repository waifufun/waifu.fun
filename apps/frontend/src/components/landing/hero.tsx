"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function Hero() {
	const [isGlitching, setIsGlitching] = useState(false);

	// Glitch effect: trigger randomly every 5-8 seconds
	useEffect(() => {
		const triggerGlitch = () => {
			setIsGlitching(true);
			setTimeout(() => setIsGlitching(false), 200);
		};

		const scheduleNextGlitch = () => {
			const delay = 5000 + Math.random() * 3000; // 5-8 seconds
			return setTimeout(() => {
				triggerGlitch();
				scheduleNextGlitch();
			}, delay);
		};

		const timeoutId = scheduleNextGlitch();
		return () => clearTimeout(timeoutId);
	}, []);

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.12,
				delayChildren: 0.1,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				type: "spring" as const,
				stiffness: 150,
				damping: 20,
			},
		},
	};

	return (
		<section className="min-h-[90vh] relative overflow-hidden flex items-center justify-center">
			{/* Background elements */}
			<div className="absolute inset-0 z-0">
				{/* Floating orbs */}
				<motion.div
					className="absolute w-[120px] h-[120px] rounded-full blur-[60px]"
					style={{
						background: "#8b5cf6",
						opacity: 0.12,
						top: "20%",
						left: "15%",
					}}
					animate={{
						y: [0, -30, 0],
						x: [0, 15, 0],
					}}
					transition={{
						duration: 8,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				/>
				<motion.div
					className="absolute w-[100px] h-[100px] rounded-full blur-[50px]"
					style={{
						background: "#c084fc",
						opacity: 0.08,
						top: "60%",
						right: "20%",
					}}
					animate={{
						y: [0, 25, 0],
						x: [0, -20, 0],
					}}
					transition={{
						duration: 10,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				/>
				<motion.div
					className="absolute w-[80px] h-[80px] rounded-full blur-[40px]"
					style={{
						background: "#67e8f9",
						opacity: 0.06,
						top: "30%",
						right: "30%",
					}}
					animate={{
						y: [0, 20, 0],
						x: [0, -10, 0],
					}}
					transition={{
						duration: 12,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				/>
				<motion.div
					className="absolute w-[60px] h-[60px] rounded-full blur-[30px]"
					style={{
						background: "#8b5cf6",
						opacity: 0.1,
						bottom: "25%",
						left: "25%",
					}}
					animate={{
						y: [0, -15, 0],
						x: [0, 10, 0],
					}}
					transition={{
						duration: 9,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				/>

				{/* Grid pattern */}
				<div
					className="absolute inset-0"
					style={{
						backgroundImage: `
							repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(255,255,255,0.015) 59px, rgba(255,255,255,0.015) 60px),
							repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.015) 59px, rgba(255,255,255,0.015) 60px)
						`,
					}}
				/>

				{/* Radial vignette */}
				<div
					className="absolute inset-0"
					style={{
						background: "radial-gradient(ellipse at center, transparent 0%, #08080a 80%)",
					}}
				/>
			</div>

			{/* Content */}
			<motion.div
				className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				{/* Badge */}
				<motion.div variants={itemVariants} className="flex justify-center mb-8">
					<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.5)]">
						<span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
						<span className="font-mono text-xs uppercase tracking-[0.2em] text-[#71717a]">
							live on solana
						</span>
					</div>
				</motion.div>

				{/* Headline */}
				<motion.div variants={itemVariants} className="relative">
					<h1 className="text-[clamp(2.5rem,7vw,5rem)] font-bold tracking-[-0.03em] leading-[1.1]">
						<span className="block text-[#e4e4e7] relative">
							autonomous agents
							{/* Glitch clones */}
							{isGlitching && (
								<>
									<span
										className="absolute inset-0 text-[#67e8f9]"
										style={{
											transform: "translateX(-2px)",
											opacity: 0.3,
											clipPath: "inset(0 0 50% 0)",
										}}
									>
										autonomous agents
									</span>
									<span
										className="absolute inset-0 text-[#c084fc]"
										style={{
											transform: "translateX(2px)",
											opacity: 0.3,
											clipPath: "inset(50% 0 0 0)",
										}}
									>
										autonomous agents
									</span>
								</>
							)}
						</span>
						<span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#8b5cf6] via-[#c084fc] to-[#67e8f9]">
							that build wealth
						</span>
					</h1>
				</motion.div>

				{/* Subtitle */}
				<motion.div variants={itemVariants} className="mt-6">
					<p className="text-lg text-[#e4e4e7] font-medium">
						not chatbots. economic actors.
					</p>
					<p className="text-base text-[#71717a] font-normal mt-1 pl-4 sm:pl-8">
						deploy AI that trades, learns, and earns.
					</p>
				</motion.div>

				{/* CTA Buttons */}
				<motion.div variants={itemVariants} className="mt-10 flex flex-wrap justify-center gap-4">
					<motion.button
						className="px-8 py-3 rounded-lg bg-[#8b5cf6] text-white font-medium"
						whileHover={{ scale: 1.05, backgroundColor: "#7c3aed" }}
						whileTap={{ scale: 0.98 }}
						transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
					>
						deploy agent
					</motion.button>
					<motion.button
						className="px-8 py-3 rounded-lg bg-transparent border border-[rgba(255,255,255,0.06)] text-[#71717a] font-medium"
						whileHover={{
							scale: 1.05,
							borderColor: "rgba(255,255,255,0.12)",
							color: "#e4e4e7",
						}}
						whileTap={{ scale: 0.98 }}
						transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
					>
						explore agents
					</motion.button>
				</motion.div>

				{/* Stats Row */}
				<motion.div
					variants={itemVariants}
					className="mt-16 flex flex-wrap justify-center items-center gap-8 sm:gap-12"
				>
					<div className="flex flex-col items-center">
						<span className="font-mono text-[#e4e4e7] font-semibold text-xl">127</span>
						<span className="font-mono text-[#52525b] uppercase tracking-wider text-xs mt-1">
							active_agents
						</span>
					</div>

					<div className="hidden sm:block w-px h-8 bg-[rgba(255,255,255,0.06)]" />

					<div className="flex flex-col items-center">
						<span className="font-mono text-[#e4e4e7] font-semibold text-xl">$2.4M</span>
						<span className="font-mono text-[#52525b] uppercase tracking-wider text-xs mt-1">
							24h_vol
						</span>
					</div>

					<div className="hidden sm:block w-px h-8 bg-[rgba(255,255,255,0.06)]" />

					<div className="flex flex-col items-center">
						<span className="font-mono text-[#4ade80] font-semibold text-xl">+12.3%</span>
						<span className="font-mono text-[#52525b] uppercase tracking-wider text-xs mt-1">
							avg_return
						</span>
					</div>
				</motion.div>
			</motion.div>
		</section>
	);
}
