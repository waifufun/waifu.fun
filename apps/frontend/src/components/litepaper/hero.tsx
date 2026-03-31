"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import VisualAsset from "@/components/litepaper/visual-asset";

export default function Hero() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start start", "end start"],
	});

	const imageY = useTransform(scrollYProgress, [0, 1], [0, -90]);
	const imageScale = useTransform(scrollYProgress, [0, 1], [1.06, 0.94]);
	const textY = useTransform(scrollYProgress, [0, 1], [0, 72]);

	return (
		<section
			ref={sectionRef}
			className="relative min-h-[100dvh] overflow-hidden border-b border-white/6 px-6 pb-14 pt-8 sm:px-8 lg:px-12 xl:px-16"
		>
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(0,255,135,0.16),transparent_24%),radial-gradient(circle_at_78%_26%,rgba(255,50,180,0.11),transparent_18%)]" />
			<div className="pointer-events-none absolute inset-0 bg-[url('/textures/noise.png')] bg-[length:240px_240px] opacity-[0.06] mix-blend-screen" />

			<div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1600px] flex-col justify-between gap-14 lg:grid lg:grid-cols-12 lg:gap-8">
				{/* Top bar */}
				<div className="flex items-start justify-between lg:col-span-12">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="flex items-center gap-4"
					>
						<div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-crt-sm">
							<Image src="/brand/icon/icon_1024.png" alt="waifu.fun" fill className="object-cover" sizes="40px" priority />
						</div>
						<div>
							<p className="font-orbitron text-[11px] font-semibold uppercase tracking-[0.45em] text-waifu-green">waifu.fun</p>
							<p className="font-satoshi text-sm text-white/55">the agent launchpad that learns</p>
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
					>
						<Link
							href="/tokens"
							className="group inline-flex items-center gap-2 rounded-full border border-waifu-green/30 bg-waifu-green/10 px-5 py-2.5 text-sm font-medium uppercase tracking-[0.15em] text-waifu-green transition-all duration-300 hover:border-waifu-green/50 hover:bg-waifu-green/20 hover:shadow-[0_0_24px_rgba(0,255,135,0.2)]"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							Launch App
							<svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
							</svg>
						</Link>
					</motion.div>
				</div>

				{/* Main content */}
				<div className="grid gap-12 lg:col-span-12 lg:grid-cols-12 lg:items-end">
					<motion.div style={{ y: textY }} className="lg:col-span-7 lg:pr-8 xl:pr-14">
						<motion.p
							initial={{ opacity: 0, x: -40 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.15, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
							className="mb-6 font-orbitron text-[11px] uppercase tracking-[0.55em] text-waifu-green/90"
						>
							the agent launchpad
						</motion.p>

						<motion.h1
							initial={{ opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
							className="max-w-5xl font-orbitron text-[clamp(3.2rem,7vw,7.5rem)] font-bold uppercase leading-[0.9] tracking-[-0.05em] text-white"
						>
							The Launchpad
							<span className="relative block text-waifu-green [text-shadow:0_0_26px_rgba(0,255,135,0.26)]">
								That Learns
							</span>
						</motion.h1>

						<motion.p
							initial={{ opacity: 0, y: 28 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
							className="mt-8 max-w-2xl font-satoshi text-[1.15rem] leading-8 text-white/72 sm:text-[1.3rem]"
						>
							launch tokens with AI agents. trading fees fine-tune the model. your waifu gets smarter the more people trade it.
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.45, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
							className="mt-10 flex flex-wrap items-center gap-4"
						>
							<Link
								href="/tokens"
								className="group inline-flex items-center gap-2.5 rounded-full bg-waifu-green px-7 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-black transition-all duration-300 hover:bg-waifu-green/90 hover:shadow-[0_0_32px_rgba(0,255,135,0.35)]"
								style={{ fontFamily: "DMMono, monospace" }}
							>
								Explore Tokens
								<svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
								</svg>
							</Link>
							<Link
								href="/create"
								className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3.5 text-sm uppercase tracking-[0.12em] text-white/70 transition-all duration-300 hover:border-white/25 hover:bg-white/10 hover:text-white/90"
								style={{ fontFamily: "DMMono, monospace" }}
							>
								Create a Waifu
							</Link>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.55, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
							className="mt-8 flex flex-wrap gap-3" style={{ fontFamily: "DMMono, monospace" }}
						>
							<span className="rounded-full border border-waifu-green/25 bg-waifu-green/10 px-3 py-1 text-xs uppercase tracking-[0.26em] text-waifu-green">
								token launchpad
							</span>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.26em] text-white/65">
								fine-tuned agents
							</span>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.26em] text-white/65">
								powered by elizaOS
							</span>
						</motion.div>
					</motion.div>

					{/* Hero image */}
					<motion.div
						style={{ y: imageY, scale: imageScale }}
						initial={{ opacity: 0, x: 60 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: 0.25, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
						className="relative lg:col-span-5"
					>
						<div className="absolute -right-8 top-10 h-32 w-32 rounded-full bg-waifu-magenta/18 blur-3xl" />
						<div className="absolute -left-8 bottom-16 h-40 w-40 rounded-full bg-waifu-green/16 blur-3xl" />
						<VisualAsset
							src="/litepaper/hero.webp"
							alt="AI agent"
							priority
							className="relative ml-auto min-h-[26rem] overflow-hidden rounded-[2rem] border border-white/10 bg-waifu-surface shadow-crt lg:min-h-[38rem]"
							imageClassName="object-cover object-center"
							fallbackClassName="bg-[radial-gradient(circle_at_50%_25%,rgba(0,255,135,0.2),transparent_24%)]"
							sizes="(min-width: 1024px) 40vw, 100vw"
						>
							<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(8,8,10,0.1)_45%,rgba(8,8,10,0.78)_100%)]" />
							<div className="absolute bottom-6 left-6 right-6">
								<div className="rounded-[1.5rem] border border-white/10 bg-black/45 p-5 backdrop-blur-xl">
									<p className="font-orbitron text-[10px] uppercase tracking-[0.35em] text-waifu-green">how it works</p>
									<p className="mt-3 max-w-sm font-satoshi text-sm leading-6 text-white/68">
										trade fees go to fine-tuning. your agent gets its own model. not a chatbot. an actual trained personality.
									</p>
								</div>
							</div>
						</VisualAsset>
					</motion.div>
				</div>

				{/* Bottom stats */}
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.6, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					className="grid gap-4 border-t border-white/8 pt-8 sm:grid-cols-3"
				>
					{[
						{ step: "01", label: "Launch", desc: "deploy your token with an AI agent attached" },
						{ step: "02", label: "Trade", desc: "trading fees accumulate from bonding curve activity" },
						{ step: "03", label: "Train", desc: "fees fund fine-tuning, your waifu gets its own model" },
					].map((stat, index) => (
						<motion.div
							key={stat.label}
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.75 + index * 0.1, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
							className="group rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm"
						>
							<div className="flex items-center gap-3">
								<span className="text-xs text-waifu-green" style={{ fontFamily: "DMMono, monospace" }}>{stat.step}</span>
								<p className="font-orbitron text-[10px] uppercase tracking-[0.35em] text-white/45">{stat.label}</p>
							</div>
							<p className="mt-3 font-satoshi text-sm leading-6 text-white/60">
								{stat.desc}
							</p>
						</motion.div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
