"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import VisualAsset from "@/components/litepaper/visual-asset";

const heroStats = [
	{ label: "Launch", value: "your waifu", hint: "token + personality" },
	{ label: "Train", value: "fine-tuned", hint: "actually unique models" },
	{ label: "Earn", value: "fees → training", hint: "gets better over time" },
];

export default function Hero() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start start", "end start"],
	});

	const imageY = useTransform(scrollYProgress, [0, 1], [0, -90]);
	const imageScale = useTransform(scrollYProgress, [0, 1], [1.06, 0.94]);
	const textY = useTransform(scrollYProgress, [0, 1], [0, 72]);
	const haloY = useTransform(scrollYProgress, [0, 1], [0, -120]);

	return (
		<section
			ref={sectionRef}
			className="relative min-h-[100dvh] overflow-hidden border-b border-white/6 px-6 pb-14 pt-8 sm:px-8 lg:px-12 xl:px-16"
		>
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(0,255,135,0.16),transparent_24%),radial-gradient(circle_at_78%_26%,rgba(255,50,180,0.11),transparent_18%),radial-gradient(circle_at_65%_85%,rgba(0,200,255,0.12),transparent_22%)]" />
			<motion.div
				style={{ y: haloY }}
				className="pointer-events-none absolute -left-32 top-12 h-[28rem] w-[28rem] rounded-full bg-[#00FF87]/8 blur-3xl"
			/>
			<div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,transparent_0px,transparent_3px,rgba(0,255,135,0.018)_4px,rgba(0,255,135,0.018)_5px)] opacity-60" />
			<div className="pointer-events-none absolute inset-0 bg-[url('/textures/noise.png')] bg-[length:240px_240px] opacity-[0.08] mix-blend-screen" />

			<div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1600px] flex-col justify-between gap-14 lg:grid lg:grid-cols-12 lg:gap-8">
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
							<p className="font-orbitron text-[10px] uppercase tracking-[0.45em] text-waifu-green">litepaper</p>
							<p className="font-satoshi text-sm text-white/55">what we're building and why</p>
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-right lg:block"
					>
						<p className="font-orbitron text-[10px] uppercase tracking-[0.4em] text-white/45">waifu.fun</p>
						<p className="font-satoshi text-sm text-white/70">the agent launchpad</p>
					</motion.div>
				</div>

				<div className="grid gap-12 lg:col-span-12 lg:grid-cols-12 lg:items-end">
					<motion.div style={{ y: textY }} className="lg:col-span-7 lg:pr-8 xl:pr-14">
						<motion.p
							initial={{ opacity: 0, x: -40 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.15, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
							className="mb-6 font-orbitron text-[11px] uppercase tracking-[0.55em] text-waifu-green/90"
						>
							waifu.fun
						</motion.p>

						<div className="relative">
							<motion.h1
								initial={{ opacity: 0, y: 40 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
								className="max-w-5xl font-orbitron text-[clamp(3.6rem,8vw,8rem)] font-bold uppercase leading-[0.9] tracking-[-0.05em] text-white"
							>
								Your Waifu
								<span className="relative block text-waifu-green [text-shadow:0_0_26px_rgba(0,255,135,0.26)]">
									Gets Smarter
								</span>
							</motion.h1>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.7, duration: 1.2 }}
								className="pointer-events-none absolute left-[2%] top-[8%] hidden text-[clamp(3.6rem,8vw,8rem)] font-orbitron font-bold uppercase tracking-[-0.05em] text-waifu-magenta/15 blur-[1px] lg:block"
							>
								Your Waifu
								<span className="block">Gets Smarter</span>
							</motion.div>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.75, duration: 1.2 }}
								className="pointer-events-none absolute left-[1.2%] top-[7.2%] hidden text-[clamp(3.6rem,8vw,8rem)] font-orbitron font-bold uppercase tracking-[-0.05em] text-waifu-cyan/15 blur-[1px] lg:block"
							>
								Your Waifu
								<span className="block">Gets Smarter</span>
							</motion.div>
						</div>

						<motion.p
							initial={{ opacity: 0, y: 28 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
							className="mt-8 max-w-2xl font-satoshi text-[1.15rem] leading-8 text-white/72 sm:text-[1.3rem]"
						>
							the agent launchpad.
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.45, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
							className="mt-12 flex max-w-3xl flex-col gap-5 border-l border-waifu-green/25 pl-5 sm:pl-8"
						>
							<p className="max-w-2xl font-satoshi text-base leading-7 text-white/62 sm:text-lg">
								every other AI companion is just a system prompt on ChatGPT. same brain, different costume. waifu.fun actually
								fine-tunes a model for each character. yours is the only one like it.
							</p>
							<div className="flex flex-wrap gap-3" style={{ fontFamily: "DMMono, monospace" }}>
								<span className="rounded-full border border-waifu-green/25 bg-waifu-green/10 px-3 py-1 text-xs uppercase tracking-[0.26em] text-waifu-green">
									fine-tuned models
								</span>
								<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.26em] text-white/65">
									own wallet
								</span>
								<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.26em] text-white/65">
									real GPUs
								</span>
							</div>
						</motion.div>
					</motion.div>

					<motion.div
						style={{ y: imageY, scale: imageScale }}
						initial={{ opacity: 0, x: 60, rotate: -3 }}
						animate={{ opacity: 1, x: 0, rotate: 0 }}
						transition={{ delay: 0.25, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
						className="relative lg:col-span-5"
					>
						<div className="absolute -right-8 top-10 h-32 w-32 rounded-full bg-waifu-magenta/18 blur-3xl" />
						<div className="absolute -left-8 bottom-16 h-40 w-40 rounded-full bg-waifu-green/16 blur-3xl" />
						<VisualAsset
							src="/litepaper/hero.webp"
							alt="A sovereign AI companion emerging from a data lattice"
							priority
							className="relative ml-auto min-h-[26rem] overflow-hidden rounded-[2rem] border border-white/10 bg-waifu-surface shadow-crt lg:min-h-[38rem]"
							imageClassName="object-cover object-center"
							fallbackClassName="bg-[radial-gradient(circle_at_50%_25%,rgba(0,255,135,0.2),transparent_24%),radial-gradient(circle_at_72%_30%,rgba(255,50,180,0.18),transparent_20%),linear-gradient(180deg,rgba(17,17,20,0.8),rgba(8,8,10,0.92))]"
							sizes="(min-width: 1024px) 40vw, 100vw"
						>
							<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(8,8,10,0.1)_45%,rgba(8,8,10,0.78)_100%)]" />
							<div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/10 bg-black/30 px-5 py-4 backdrop-blur-md">
								<p className="font-orbitron text-[10px] uppercase tracking-[0.38em] text-white/45">waifu runtime</p>
								<p className="text-[11px] uppercase tracking-[0.26em] text-waifu-green" style={{ fontFamily: "DMMono, monospace" }}>
									live
								</p>
							</div>
							<div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
								<div className="rounded-[1.5rem] border border-white/10 bg-black/45 p-5 backdrop-blur-xl">
									<p className="font-orbitron text-[10px] uppercase tracking-[0.35em] text-waifu-green">your waifu</p>
									<p className="mt-3 max-w-sm font-satoshi text-sm leading-6 text-white/68">
										a real personality, its own wallet, running on real hardware. not a chatbot.
									</p>
								</div>
								<div className="rounded-[1.5rem] border border-waifu-green/20 bg-waifu-green/10 p-5 shadow-crt-sm backdrop-blur-xl">
									<p className="text-[10px] uppercase tracking-[0.26em] text-white/55" style={{ fontFamily: "DMMono, monospace" }}>
										status
									</p>
									<p className="mt-2 text-2xl font-semibold text-waifu-green" style={{ fontFamily: "DMMono, monospace" }}>
										100%
									</p>
									<div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
										<motion.div
											initial={{ width: 0 }}
											animate={{ width: "100%" }}
											transition={{ delay: 0.9, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
											className="h-full bg-waifu-green"
										/>
									</div>
								</div>
							</div>
						</VisualAsset>
					</motion.div>
				</div>

				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.55, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					className="grid gap-4 border-t border-white/8 pt-8 sm:grid-cols-3"
				>
					{heroStats.map((stat, index) => (
						<motion.div
							key={stat.label}
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.7 + index * 0.1, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
							className="group rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm transition-transform duration-500 hover:-translate-y-1"
						>
							<p className="font-orbitron text-[10px] uppercase tracking-[0.35em] text-white/45">{stat.label}</p>
							<div className="mt-6 flex items-end justify-between gap-4">
								<p className="font-orbitron text-2xl uppercase tracking-[-0.03em] text-white group-hover:text-waifu-green">
									{stat.value}
								</p>
								<p className="max-w-[10rem] text-right text-[11px] uppercase tracking-[0.24em] text-white/36" style={{ fontFamily: "DMMono, monospace" }}>
									{stat.hint}
								</p>
							</div>
						</motion.div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
