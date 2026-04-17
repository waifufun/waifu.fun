"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import VisualAsset from "@/components/litepaper/visual-asset";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

function RevealBlock({
	children,
	delay = 0,
}: {
	children: React.ReactNode;
	delay?: number;
}) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-60px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 28 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay, ease: EASE_OUT_EXPO }}
		>
			{children}
		</motion.div>
	);
}

const pillars = [
	{
		id: "01",
		label: "ElizaOS native",
		desc: "built on ElizaOS and Eliza Cloud. production-grade agent infrastructure, not a wrapper.",
	},
	{
		id: "02",
		label: "powered by Four.Meme",
		desc: "agent tokens launch on Four.Meme's BSC bonding curve. we own the runtime; they own the rails. graduates hit PancakeSwap.",
	},
	{
		id: "03",
		label: "self-funded",
		desc: "TaxToken routes a perpetual cut of every trade into the agent's treasury. it pays for inference, keeps the rest.",
	},
];

export default function HeroV2() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start start", "end start"],
	});

	const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
	const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

	return (
		<section
			ref={sectionRef}
			className="relative min-h-[100dvh] flex items-center py-28 sm:py-40 overflow-hidden"
		>
			{/* Radial glow — top left asymmetric */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 30% -10%, rgba(0,255,135,0.07) 0%, transparent 50%)",
				}}
			/>
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 85% 60%, rgba(0,255,135,0.03) 0%, transparent 35%)",
				}}
			/>

			<motion.div
				className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full"
				style={{ y: heroY, opacity: heroOpacity }}
			>
				{/* Asymmetric split: 7/5 grid */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
					{/* Text column — left heavy */}
					<div className="lg:col-span-7">
						{/* Brand lockup */}
						<motion.div
							initial={{ opacity: 0, scale: 0.92 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
							className="mb-8"
						>
							<Image
								src="/brand/lockup/lockup_waifufun_1920.png"
								alt="waifu.fun"
								width={400}
								height={102}
								priority
								className="h-auto w-[200px] sm:w-[280px] lg:w-[340px] object-contain"
								unoptimized
							/>
						</motion.div>

						<motion.div
							className="inline-flex items-center gap-2.5 px-4 py-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.6)] mb-10"
							initial={{ opacity: 0, x: -24 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.15, duration: 0.6, ease: EASE_OUT_EXPO }}
						>
							<span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#71717a]">
								the agent economy
							</span>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.25, duration: 0.7, ease: EASE_OUT_EXPO }}
						>
							<h1 className="font-satoshi text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.04em] leading-[0.92] text-[#e4e4e7] mb-8">
								<span className="block">agents that earn</span>
								<span className="block text-[#00ff87] relative">
									their own living
									<motion.span
										className="absolute -right-3 top-1 w-2 h-2 rounded-full bg-[#00ff87]"
										animate={{ opacity: [1, 0.2, 1] }}
										transition={{
											duration: 2.5,
											repeat: Number.POSITIVE_INFINITY,
											ease: "easeInOut",
										}}
									/>
								</span>
							</h1>
						</motion.div>

						<motion.p
							className="text-lg sm:text-xl text-[#a1a1aa] leading-relaxed max-w-[52ch]"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.4, duration: 0.7, ease: EASE_OUT_QUART }}
						>
							the agent runtime layer on BSC. identity, brain, wallet, and
							treasury for every agent. token launches powered by Four.Meme.
							self-sustaining.
						</motion.p>

						<motion.div
							className="mt-10 flex flex-wrap items-center gap-3"
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.55, duration: 0.6, ease: EASE_OUT_EXPO }}
						>
							<Link
								href="/create"
								className="group relative inline-flex items-center gap-3 px-8 py-3.5 text-sm font-medium tracking-wide uppercase text-[#08080a] bg-[#00ff87] rounded-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_0_20px_rgba(0,255,135,0.15)] active:scale-[0.98]"
							>
								build an agent
								<span className="flex items-center justify-center w-6 h-6 rounded-sm bg-[rgba(8,8,10,0.12)]">
									<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
								</span>
							</Link>
							<Link
								href="/#explore"
								className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium tracking-wide uppercase text-[#71717a] border border-[rgba(255,255,255,0.08)] rounded-sm hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.16)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
							>
								explore agents
							</Link>
						</motion.div>
					</div>

					{/* Hero image — right column with double-bezel */}
					<motion.div
						initial={{ opacity: 0, x: 40 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{
							delay: 0.3,
							duration: 0.9,
							ease: EASE_OUT_EXPO,
						}}
						className="lg:col-span-5"
					>
						{/* Outer shell (double-bezel) */}
						<div className="rounded-sm p-1.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]">
							{/* Inner core */}
							<VisualAsset
								src="/litepaper/v2/hero-agent.webp"
								alt="Autonomous AI agent"
								priority
								className="relative aspect-[3/4] rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]"
								imageClassName="object-cover object-center"
								sizes="(min-width: 1024px) 38vw, 100vw"
							>
								<div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent" />
								<div className="absolute bottom-0 left-0 right-0 p-5">
									<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.88)] backdrop-blur-sm p-4">
										<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
											the difference
										</span>
										<p className="mt-2.5 text-sm leading-6 text-[#a1a1aa]">
											this isn&apos;t a chatbot with a token. this is an agent
											that works for a living.
										</p>
									</div>
								</div>
							</VisualAsset>
						</div>
					</motion.div>
				</div>

				{/* Three pillars — staggered reveal */}
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.7, duration: 0.7, ease: EASE_OUT_EXPO }}
					className="mt-20 grid gap-4 border-t border-[rgba(255,255,255,0.06)] pt-10 sm:grid-cols-3"
				>
					{pillars.map((pillar, i) => (
						<motion.div
							key={pillar.id}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								delay: 0.85 + i * 0.1,
								duration: 0.5,
								ease: EASE_OUT_QUART,
							}}
							className="group rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-5 hover:border-[rgba(0,255,135,0.15)] transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
						>
							<div className="flex items-center gap-3">
								<span className="font-mono text-xs text-[#00ff87]">
									{pillar.id}
								</span>
								<p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
									{pillar.label}
								</p>
							</div>
							<p className="mt-3 text-sm leading-6 text-[#a1a1aa]">
								{pillar.desc}
							</p>
						</motion.div>
					))}
				</motion.div>
			</motion.div>
		</section>
	);
}
