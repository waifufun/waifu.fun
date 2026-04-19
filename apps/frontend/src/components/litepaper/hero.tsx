"use client";

import VisualAsset from "@/components/litepaper/visual-asset";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

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
			transition={{ duration: 0.6, delay, ease: EASE }}
		>
			{children}
		</motion.div>
	);
}

export default function Hero() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start start", "end start"],
	});

	const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);
	const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

	return (
		<section ref={sectionRef} className="relative min-h-[90vh] flex items-center py-28 sm:py-40 overflow-hidden">
			{/* Subtle radial glow */}
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,255,135,0.06) 0%, transparent 50%)" }}
			/>
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(0,255,135,0.03) 0%, transparent 40%)" }}
			/>

			<motion.div
				className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full"
				style={{ y: heroY, opacity: heroOpacity }}
			>
				<SectionBlock>
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
						{/* Text column */}
						<div className="lg:col-span-7">
							<motion.div
								className="inline-flex items-center gap-2.5 px-4 py-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.6)] mb-10"
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.2, ease: EASE }}
							>
								<span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#71717a]">litepaper</span>
							</motion.div>

							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.3, ease: EASE }}
							>
								<h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.04em] leading-[0.95] text-[#e4e4e7] mb-8">
									<span className="block">the launchpad</span>
									<span className="block text-[#00ff87] relative">
										that learns
										<motion.span
											className="absolute -right-4 top-0 w-2 h-2 rounded-full bg-[#00ff87]"
											animate={{ opacity: [1, 0.3, 1] }}
											transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
										/>
									</span>
								</h1>
							</motion.div>

							<motion.p
								className="text-lg sm:text-xl text-[#a1a1aa] leading-relaxed max-w-lg"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.5, ease: EASE }}
							>
								launch tokens with AI agents. trading fees fine-tune the model. your waifu gets smarter the more people
								trade it.
							</motion.p>

							<motion.div
								className="mt-10 flex flex-wrap items-center gap-3"
								initial={{ opacity: 0, y: 16 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.65, ease: EASE }}
							>
								<Link
									href="/#explore"
									className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium tracking-wide uppercase text-[#08080a] bg-[#00ff87] rounded-none transition-opacity hover:opacity-90"
								>
									explore tokens
								</Link>
								<Link
									href="/agents"
									className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium tracking-wide uppercase text-[#71717a] border border-[rgba(255,255,255,0.08)] rounded-none hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.16)] transition-colors duration-300"
								>
									create a waifu
								</Link>
							</motion.div>

							<motion.p
								className="text-[#52525b] mt-8 text-sm font-mono"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.8 }}
							>
								scroll to read ↓
							</motion.p>
						</div>

						{/* Hero image */}
						<motion.div
							initial={{ opacity: 0, x: 40 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.3, duration: 0.8, ease: EASE }}
							className="lg:col-span-5"
						>
							<VisualAsset
								src="/litepaper/hero.webp"
								alt="AI agent"
								priority
								className="relative aspect-[3/4] rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]"
								imageClassName="object-cover object-center"
								sizes="(min-width: 1024px) 40vw, 100vw"
							>
								<div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent" />
								<div className="absolute bottom-0 left-0 right-0 p-6">
									<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.85)] p-5">
										<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
											how it works
										</span>
										<p className="mt-3 text-sm leading-6 text-[#a1a1aa]">
											trade fees go to fine-tuning. your agent gets its own model. not a chatbot. an actual trained
											personality.
										</p>
									</div>
								</div>
							</VisualAsset>
						</motion.div>
					</div>
				</SectionBlock>

				{/* Bottom stats row */}
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.7, duration: 0.6, ease: EASE }}
					className="mt-20 grid gap-4 border-t border-[rgba(255,255,255,0.06)] pt-8 sm:grid-cols-3"
				>
					{[
						{ step: "01", label: "launch", desc: "deploy your token with an AI agent attached" },
						{ step: "02", label: "trade", desc: "trading fees accumulate from bonding curve activity" },
						{ step: "03", label: "train", desc: "fees fund fine-tuning, your waifu gets its own model" },
					].map((stat, index) => (
						<motion.div
							key={stat.label}
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.85 + index * 0.1, duration: 0.5, ease: EASE }}
							className="group rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-5 hover:border-[rgba(0,255,135,0.2)] transition-colors duration-300"
						>
							<div className="flex items-center gap-3">
								<span className="font-mono text-xs text-[#00ff87]">{stat.step}</span>
								<p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">{stat.label}</p>
							</div>
							<p className="mt-3 text-sm leading-6 text-[#a1a1aa]">{stat.desc}</p>
						</motion.div>
					))}
				</motion.div>
			</motion.div>
		</section>
	);
}
