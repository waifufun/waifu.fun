"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";

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

	const steps = [
		{
			num: "01",
			title: "deploy",
			desc: "launch your agent with a bonding curve token",
			icon: (
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M12 2L2 7l10 5 10-5-10-5z" />
					<path d="M2 17l10 5 10-5" />
					<path d="M2 12l10 5 10-5" />
				</svg>
			),
		},
		{
			num: "02",
			title: "trade",
			desc: "agent autonomously executes strategies on-chain",
			icon: (
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
					<polyline points="16 7 22 7 22 13" />
				</svg>
			),
		},
		{
			num: "03",
			title: "earn",
			desc: "token holders share in the agent's performance",
			icon: (
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<circle cx="12" cy="12" r="10" />
					<path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8" />
					<path d="M12 18V6" />
				</svg>
			),
		},
	];

	return (
		<section className="min-h-[92vh] relative overflow-hidden flex items-center">
			{/* Background elements */}
			<div className="absolute inset-0 z-0">
				{/* Ambient glow behind mascot area */}
				<div
					className="absolute w-[500px] h-[500px] rounded-full blur-[120px]"
					style={{
						background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
						top: "10%",
						right: "5%",
					}}
				/>
				<div
					className="absolute w-[300px] h-[300px] rounded-full blur-[80px]"
					style={{
						background: "radial-gradient(circle, rgba(103,232,249,0.08) 0%, transparent 70%)",
						top: "40%",
						right: "15%",
					}}
				/>

				{/* Floating orbs */}
				<motion.div
					className="absolute w-[100px] h-[100px] rounded-full blur-[50px]"
					style={{ background: "#8b5cf6", opacity: 0.1, top: "25%", left: "10%" }}
					animate={{ y: [0, -25, 0], x: [0, 12, 0] }}
					transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
				/>
				<motion.div
					className="absolute w-[70px] h-[70px] rounded-full blur-[35px]"
					style={{ background: "#c084fc", opacity: 0.07, bottom: "30%", left: "20%" }}
					animate={{ y: [0, 18, 0], x: [0, -10, 0] }}
					transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
				/>

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
						{/* Badge */}
						<motion.div variants={itemVariants} className="mb-8">
							<div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.6)] backdrop-blur-sm">
								<span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
								<span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#71717a]">
									live on solana
								</span>
							</div>
						</motion.div>

						{/* Headline */}
						<motion.div variants={itemVariants} className="relative">
							<h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold tracking-[-0.035em] leading-[1.05]">
								<span className="block text-[#e4e4e7] relative">
									autonomous
									{isGlitching && (
										<>
											<span
												className="absolute inset-0 text-[#67e8f9]"
												style={{
													transform: "translateX(-1.5px)",
													opacity: 0.25,
													clipPath: "inset(0 0 60% 0)",
												}}
											>
												autonomous
											</span>
											<span
												className="absolute inset-0 text-[#c084fc]"
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
								<span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#8b5cf6] via-[#c084fc] to-[#67e8f9]">
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
								deploy AI that trades, learns, and earns — powered by ElizaOS on Solana.
							</p>
						</motion.div>

						{/* CTA Buttons */}
						<motion.div variants={itemVariants} className="mt-8 flex flex-wrap gap-3">
							<motion.a
								href="/create"
								className="inline-flex items-center gap-2 px-7 py-3 rounded-lg font-medium text-white relative overflow-hidden"
								style={{
									background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
									boxShadow: "0 0 20px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
								}}
								whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.1)" }}
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
								href="/"
								className="inline-flex items-center px-7 py-3 rounded-lg border border-[rgba(255,255,255,0.08)] text-[#71717a] font-medium bg-[rgba(17,17,20,0.4)] backdrop-blur-sm"
								whileHover={{
									scale: 1.03,
									borderColor: "rgba(139,92,246,0.3)",
									color: "#e4e4e7",
								}}
								whileTap={{ scale: 0.98 }}
								transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
							>
								explore agents
							</motion.a>
						</motion.div>

						{/* Stats Row */}
						<motion.div
							variants={itemVariants}
							className="mt-12 flex flex-wrap items-center gap-6 sm:gap-8"
						>
							{[
								{ value: "127", label: "active_agents", color: "#e4e4e7" },
								{ value: "$2.4M", label: "24h_volume", color: "#e4e4e7" },
								{ value: "+12.3%", label: "avg_return", color: "#4ade80" },
							].map((stat, i) => (
								<div key={stat.label} className="flex items-center gap-6 sm:gap-8">
									{i > 0 && (
										<div className="hidden sm:block w-px h-6 bg-[rgba(255,255,255,0.06)]" />
									)}
									<div className="flex flex-col">
										<span
											className="font-mono text-lg font-semibold"
											style={{ color: stat.color }}
										>
											{stat.value}
										</span>
										<span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#52525b] mt-0.5">
											{stat.label}
										</span>
									</div>
								</div>
							))}
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
							{/* Glow ring behind mascot */}
							<div
								className="absolute inset-0 -m-4 rounded-2xl"
								style={{
									background: "radial-gradient(ellipse at center, rgba(139,92,246,0.08) 0%, transparent 70%)",
								}}
							/>
							<Image
								src="/waifus/waifu-charsheet.png"
								alt="waifu.fun mascot"
								fill
								className="object-contain drop-shadow-[0_0_40px_rgba(139,92,246,0.15)]"
								priority
							/>
						</motion.div>
					</motion.div>
				</div>

				{/* How it works — mini steps */}
				<motion.div
					variants={itemVariants}
					className="mt-16 lg:mt-20 pt-12 border-t border-[rgba(255,255,255,0.04)]"
				>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
						{steps.map((step, i) => (
							<motion.div
								key={step.num}
								className="group relative flex flex-col gap-3 p-5 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(17,17,20,0.3)] backdrop-blur-sm"
								whileHover={{
									borderColor: "rgba(139,92,246,0.15)",
									backgroundColor: "rgba(17,17,20,0.5)",
								}}
								transition={{ duration: 0.3 }}
							>
								<div className="flex items-center gap-3">
									<div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[rgba(139,92,246,0.08)] border border-[rgba(139,92,246,0.1)]">
										{step.icon}
									</div>
									<span className="font-mono text-[10px] text-[#52525b] tracking-[0.2em] uppercase">
										{step.num}
									</span>
									{i < steps.length - 1 && (
										<div className="hidden sm:block flex-1 h-px bg-gradient-to-r from-[rgba(139,92,246,0.15)] to-transparent ml-2" />
									)}
								</div>
								<h3 className="font-semibold text-[#e4e4e7] text-sm">
									{step.title}
								</h3>
								<p className="text-[13px] text-[#52525b] leading-relaxed">
									{step.desc}
								</p>
							</motion.div>
						))}
					</div>
				</motion.div>
			</motion.div>
		</section>
	);
}
