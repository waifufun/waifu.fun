"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";

const Aurora = dynamic(() => import("@/components/backgrounds/Aurora"), {
	ssr: false,
});

export default function Hero() {
	const [isGlitching, setIsGlitching] = useState(false);

	useEffect(() => {
		const triggerGlitch = () => {
			setIsGlitching(true);
			setTimeout(() => setIsGlitching(false), 150);
		};

		const scheduleNextGlitch = () => {
			const delay = 6000 + Math.random() * 4000;
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
				staggerChildren: 0.1,
				delayChildren: 0.15,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 24 },
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				type: "spring" as const,
				stiffness: 120,
				damping: 20,
			},
		},
	};

	return (
		<section className="relative overflow-hidden flex items-center min-h-[85vh] py-16 lg:py-24">
			{/* Aurora animated background */}
			<div className="absolute inset-0 z-0">
				<Aurora
					colorStops={["#00ff87", "#065f46", "#00ff87"]}
					amplitude={1.5}
					speed={0.5}
					blend={0.6}
				/>
			</div>

			{/* Dark overlay for text readability */}
			<div className="absolute inset-0 z-[1] bg-[rgba(8,8,10,0.6)]" />

			{/* Bottom gradient fade to page background */}
			<div
				className="absolute bottom-0 left-0 right-0 z-[2] h-32"
				style={{
					background: "linear-gradient(to bottom, transparent, #08080a)",
				}}
			/>

			{/* Background elements */}
			<div className="absolute inset-0 z-[3]">
				{/* Grid pattern */}
				<div
					className="absolute inset-0"
					style={{
						backgroundImage: `
							repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(255,255,255,0.012) 59px, rgba(255,255,255,0.012) 60px),
							repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.012) 59px, rgba(255,255,255,0.012) 60px)
						`,
					}}
				/>

				{/* Radial vignette */}
				<div
					className="absolute inset-0"
					style={{
						background: "radial-gradient(ellipse at 30% 50%, transparent 0%, #08080a 75%)",
					}}
				/>
			</div>

			{/* Content */}
			<motion.div
				className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-4 items-center">
					{/* Left: Text content */}
					<div className="flex flex-col">
						{/* Headline */}
						<motion.div variants={itemVariants} className="relative">
							<h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold tracking-[-0.035em] leading-[1.05]">
								<span className="block text-[#e4e4e7] relative">
									autonomous
									{isGlitching && (
										<>
											<span
												className="absolute inset-0 text-[#00ff87]"
												style={{
													transform: "translateX(-1.5px)",
													opacity: 0.25,
													clipPath: "inset(0 0 60% 0)",
												}}
											>
												autonomous
											</span>
											<span
												className="absolute inset-0 text-[#22c55e]"
												style={{
													transform: "translateX(1.5px)",
													opacity: 0.25,
													clipPath: "inset(60% 0 0 0)",
												}}
											>
												autonomous
											</span>
										</>
									)}
								</span>
								<span className="block text-[#e4e4e7]">agents that</span>
								<span className="block text-[#00ff87]">
									build wealth
								</span>
							</h1>
						</motion.div>

						{/* Subtitle */}
						<motion.div variants={itemVariants} className="mt-6 max-w-md">
							<p className="text-lg text-[#e4e4e7] font-medium leading-relaxed">
								not chatbots. <span className="text-[#71717a]">economic actors.</span>
							</p>
							<p className="text-[15px] text-[#52525b] mt-2 leading-relaxed">
								powered by Milady Cloud &amp; Eliza Cloud. your milady becomes a waifu — an autonomous agent that trades, learns, and earns 24/7 on Solana.
							</p>
						</motion.div>

						{/* CTA Buttons */}
						<motion.div variants={itemVariants} className="mt-8 flex flex-wrap gap-3">
							<motion.a
								href="/create"
								className="inline-flex items-center gap-2 px-7 py-3 rounded-sm font-medium text-[#08080a] relative overflow-hidden"
								style={{
									background: "#00ff87",
									boxShadow: "0 0 20px rgba(0,255,135,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
								}}
								whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(0,255,135,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" }}
								whileTap={{ scale: 0.98 }}
								transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
							>
								deploy agent
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<line x1="5" y1="12" x2="19" y2="12" />
									<polyline points="12 5 19 12 12 19" />
								</svg>
							</motion.a>
							<motion.a
								href="#how-it-works"
								className="inline-flex items-center px-7 py-3 rounded-sm border border-[rgba(255,255,255,0.08)] text-[#71717a] font-medium bg-[rgba(17,17,20,0.4)]"
								whileHover={{
									scale: 1.03,
									borderColor: "rgba(0,255,135,0.25)",
									color: "#e4e4e7",
								}}
								whileTap={{ scale: 0.98 }}
								transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
							>
								explore agents
							</motion.a>
						</motion.div>

						{/* Powered by badge */}
						<motion.div variants={itemVariants} className="mt-5 flex items-center gap-4">
							<a
								href="https://milady.ai"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-[#52525b] hover:text-[#c084fc] transition-colors duration-200 text-xs font-mono"
							>
								💜 milady cloud
							</a>
							<span className="text-[#333] text-xs">×</span>
							<a
								href="https://elizaos.ai"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-[#52525b] hover:text-[#00ff87] transition-colors duration-200 text-xs font-mono"
							>
								⚡ elizaos
							</a>
						</motion.div>

					</div>

					{/* Right: Mascot illustration */}
					<motion.div
						variants={itemVariants}
						className="relative flex justify-center lg:justify-end"
					>
						<motion.div
							className="relative w-[320px] h-[420px] sm:w-[380px] sm:h-[500px] lg:w-[440px] lg:h-[580px]"
							animate={{ y: [0, -8, 0] }}
							transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
						>
							{/* Green glow beneath mascot */}
							<div
								className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[60px] rounded-full blur-[40px]"
								style={{
									background: "radial-gradient(ellipse, rgba(0,255,135,0.15) 0%, transparent 70%)",
								}}
							/>
							<Image
								src="/waifus/eliza-hero.png"
								alt="waifu.fun mascot"
								fill
								className="object-contain drop-shadow-[0_0_30px_rgba(0,255,135,0.12)]"
								priority
							/>
						</motion.div>
					</motion.div>
				</div>

			</motion.div>
		</section>
	);
}
