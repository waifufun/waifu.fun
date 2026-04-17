"use client";

import { motion, useInView } from "framer-motion";
import { Copy, Lock, TrendingDown } from "lucide-react";
import { useRef } from "react";
import VisualAsset from "@/components/litepaper/visual-asset";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

function RevealBlock({
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
			initial={{ opacity: 0, y: 28 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay, ease: EASE_OUT_EXPO }}
		>
			{children}
		</motion.div>
	);
}

const problems = [
	{
		icon: Copy,
		title: "copy-paste agents",
		body: "every agent looks the same because every agent IS the same. a system prompt, a profile picture, a bonding curve. personality is a string, not a model. there's no depth to extract value from.",
	},
	{
		icon: Lock,
		title: "framework lock-in",
		body: "one runtime. one set of capabilities. if the framework stalls, every agent on the platform stalls with it. innovation bottlenecked by a single repo.",
	},
	{
		icon: TrendingDown,
		title: "fees that vanish",
		body: "trading fees get extracted to platform treasuries and never touch the agent again. nothing compounds. the agent stays exactly as dumb as the day it launched.",
	},
];

export default function ProblemV2() {
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			{/* Subtle asymmetric glow */}
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 75% 20%, rgba(248,113,113,0.04) 0%, transparent 45%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Asymmetric editorial split: text left, image right */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
					{/* Left — copy */}
					<div className="lg:col-span-7">
						<RevealBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#f87171]/70 block mb-4">
								the trenches
							</span>
							<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase">
								launchpads extract. <span className="text-[#52525b]">agents flatline.</span>
							</h2>
						</RevealBlock>

						<RevealBlock delay={0.1}>
							<div className="mt-8 space-y-5 max-w-[58ch]">
								<p className="text-[#a1a1aa] text-base sm:text-lg leading-relaxed">
									the current agent token meta is a factory line. same wrapper, same prompt template, same bonding
									curve, same chart. launch, pump, dump, next. nothing learns. nothing compounds. nothing survives past
									the first week.
								</p>
								<p className="text-[#a1a1aa] text-base sm:text-lg leading-relaxed">
									fees leave the system the moment they&apos;re collected. agents are locked to one framework with no
									room to evolve. every &ldquo;AI agent&rdquo; is a skin over the same API call.
								</p>
								<p className="text-[#f87171] text-base sm:text-lg leading-relaxed font-medium">
									this is extraction, not infrastructure.
								</p>
								<p className="mt-3 font-mono text-[11px] tracking-[0.1em] text-[#f87171]/40">
									they take. nothing comes back.
								</p>
							</div>
						</RevealBlock>
					</div>

					{/* Right — image with double-bezel */}
					<div className="lg:col-span-5">
						<RevealBlock delay={0.2}>
							<div className="rounded-sm p-1.5 bg-[rgba(248,113,113,0.02)] border border-[rgba(248,113,113,0.08)]">
								<VisualAsset
									src="/litepaper/v2/problem-extraction.webp"
									alt="The extraction problem"
									className="relative aspect-[4/5] rounded-sm border border-[rgba(255,255,255,0.04)] bg-[#111114] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]"
									imageClassName="object-cover object-center opacity-80"
									sizes="(min-width: 1024px) 36vw, 100vw"
								>
									<div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/30 to-transparent" />
									{/* Overlay data */}
									<div className="absolute bottom-0 left-0 right-0 p-5">
										<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
											typical agent lifespan
										</div>
										<div className="mt-2 flex items-baseline gap-2">
											<span className="font-mono text-3xl font-bold text-[#f87171]">~7</span>
											<span className="font-mono text-sm text-[#52525b]">days</span>
										</div>
									</div>
								</VisualAsset>
							</div>
						</RevealBlock>
					</div>
				</div>

				{/* Problem cards — equal 3-col */}
				<div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4">
					{problems.map((problem, i) => {
						const Icon = problem.icon;
						return (
							<RevealBlock key={problem.title} delay={0.15 + i * 0.08}>
								<motion.div className="h-full rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[rgba(248,113,113,0.15)]">
									<div className="flex items-center gap-3 mb-4">
										<div className="w-9 h-9 rounded-sm bg-[rgba(248,113,113,0.08)] flex items-center justify-center">
											<Icon className="w-4 h-4 text-[#f87171]" strokeWidth={1.5} />
										</div>
										<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
											{String(i + 1).padStart(2, "0")}
										</span>
									</div>
									<h3 className="font-satoshi text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-3">
										{problem.title}
									</h3>
									<p className="text-sm leading-6 text-[#a1a1aa]">{problem.body}</p>
								</motion.div>
							</RevealBlock>
						);
					})}
				</div>
			</div>
		</section>
	);
}
