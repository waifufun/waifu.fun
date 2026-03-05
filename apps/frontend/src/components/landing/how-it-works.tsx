"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";

function SectionBlock({
	children,
	delay = 0,
}: {
	children: React.ReactNode;
	delay?: number;
}) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-80px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 32 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
		>
			{children}
		</motion.div>
	);
}

export default function HowItWorks() {
	const steps = [
		{
			num: "01",
			title: "deploy your agent",
			description:
				"Choose a personality, set a trading strategy, and launch with a bonding curve token. Your agent goes live instantly on Solana.",
			image: "/waifus/eliza-cyberpunk.png",
			accent: "#8b5cf6",
		},
		{
			num: "02",
			title: "agent trades autonomously",
			description:
				"Powered by ElizaOS, your agent monitors markets, executes trades, and adapts its strategy in real-time — no babysitting required.",
			image: "/waifus/eliza-trading.png",
			accent: "#c084fc",
		},
		{
			num: "03",
			title: "you earn",
			description:
				"As your agent performs, token value reflects its success. Hold, trade, or compound — the choice is yours.",
			image: "/waifus/solana-chan.png",
			accent: "#67e8f9",
		},
	];

	const differentiators = [
		{
			icon: (
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M12 2a7 7 0 017 7c0 3-2 5.5-4 7.5L12 22l-3-5.5C7 14.5 5 12 5 9a7 7 0 017-7z" />
					<circle cx="12" cy="9" r="2.5" />
				</svg>
			),
			title: "ElizaOS powered",
			desc: "Built on the most advanced open-source AI agent framework. Battle-tested, extensible, unstoppable.",
		},
		{
			icon: (
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
				</svg>
			),
			title: "solana speed",
			desc: "Sub-second finality. Fractions of a cent in fees. Your agents trade at the speed of opportunity.",
		},
		{
			icon: (
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 00-3-3.87" />
					<path d="M16 3.13a4 4 0 010 7.75" />
				</svg>
			),
			title: "community-owned",
			desc: "No VCs, no gatekeepers. Every agent is tokenized, every holder has a stake. This is DeFi as it should be.",
		},
	];

	return (
		<section id="how-it-works" className="relative py-24 sm:py-32 overflow-hidden">
			{/* Subtle background accent */}
			<div
				className="absolute w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none"
				style={{
					background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
					top: "20%",
					left: "50%",
					transform: "translateX(-50%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Section: What are agents? */}
				<SectionBlock>
					<div className="text-center max-w-2xl mx-auto mb-20">
						<span className="inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-[#8b5cf6] mb-4">
							the paradigm shift
						</span>
						<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight">
							what if your portfolio{" "}
							<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8b5cf6] to-[#c084fc]">
								thought for itself?
							</span>
						</h2>
						<p className="mt-4 text-[#71717a] text-base leading-relaxed max-w-lg mx-auto">
							Agents aren&apos;t bots following scripts. They&apos;re autonomous economic entities — 
							AI that observes markets, makes decisions, and executes trades with their own on-chain wallets.
						</p>
					</div>
				</SectionBlock>

				{/* Section: How it works — 3 step visual flow */}
				<div className="mb-24">
					<SectionBlock>
						<div className="flex items-center gap-3 mb-10">
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
								how it works
							</span>
							<div className="flex-1 h-px bg-[rgba(255,255,255,0.04)]" />
						</div>
					</SectionBlock>

					<div className="space-y-8">
						{steps.map((step, i) => (
							<SectionBlock key={step.num} delay={i * 0.1}>
								<div
									className={`group relative grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-8 items-center p-6 sm:p-8 rounded-2xl border border-[rgba(255,255,255,0.04)] bg-[rgba(17,17,20,0.3)] backdrop-blur-sm transition-all duration-500 hover:border-[rgba(139,92,246,0.12)]`}
								>
									{/* Step image */}
									<div
										className={`md:col-span-2 flex justify-center ${i % 2 === 1 ? "md:order-2" : ""}`}
									>
										<div className="relative w-[160px] h-[200px] sm:w-[200px] sm:h-[250px]">
											<Image
												src={step.image}
												alt={step.title}
												fill
												className="object-contain"
											/>
											{/* Glow */}
											<div
												className="absolute inset-0 -m-4 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
												style={{
													background: `radial-gradient(ellipse at center, ${step.accent}10 0%, transparent 70%)`,
												}}
											/>
										</div>
									</div>

									{/* Step text */}
									<div
										className={`md:col-span-3 flex flex-col gap-3 ${i % 2 === 1 ? "md:order-1" : ""}`}
									>
										<div className="flex items-center gap-3">
											<span
												className="font-mono text-xs font-semibold"
												style={{ color: step.accent }}
											>
												{step.num}
											</span>
											<div
												className="w-8 h-px"
												style={{ background: `${step.accent}40` }}
											/>
										</div>
										<h3 className="text-xl sm:text-2xl font-bold text-[#e4e4e7] tracking-[-0.02em]">
											{step.title}
										</h3>
										<p className="text-[#71717a] text-[15px] leading-relaxed max-w-md">
											{step.description}
										</p>
									</div>
								</div>
							</SectionBlock>
						))}
					</div>
				</div>

				{/* Section: Why waifu.fun */}
				<SectionBlock>
					<div className="flex items-center gap-3 mb-10">
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
							why waifu.fun
						</span>
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.04)]" />
					</div>
				</SectionBlock>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
					{differentiators.map((d, i) => (
						<SectionBlock key={d.title} delay={i * 0.08}>
							<div className="group relative flex flex-col gap-4 p-6 rounded-xl border border-[rgba(255,255,255,0.04)] bg-[rgba(17,17,20,0.4)] backdrop-blur-sm transition-all duration-400 hover:border-[rgba(139,92,246,0.12)] hover:bg-[rgba(17,17,20,0.6)] h-full">
								{/* Glass highlight */}
								<div
									className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
									style={{
										background: "linear-gradient(135deg, rgba(139,92,246,0.04) 0%, transparent 50%)",
									}}
								/>
								<div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-lg bg-[rgba(139,92,246,0.06)] border border-[rgba(139,92,246,0.08)]">
									{d.icon}
								</div>
								<h3 className="relative z-10 font-semibold text-[#e4e4e7] text-sm tracking-[-0.01em]">
									{d.title}
								</h3>
								<p className="relative z-10 text-[13px] text-[#52525b] leading-relaxed">
									{d.desc}
								</p>
							</div>
						</SectionBlock>
					))}
				</div>
			</div>
		</section>
	);
}
