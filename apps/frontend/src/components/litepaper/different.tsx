"use client";

import VisualAsset from "@/components/litepaper/visual-asset";
import { motion, useInView } from "framer-motion";
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

export default function Different() {
	return (
		<section className="relative py-24 sm:py-32 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 20% 40%, rgba(0,255,135,0.04) 0%, transparent 50%)" }}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
					{/* Left — image */}
					<SectionBlock>
						<div className="lg:col-span-5">
							<VisualAsset
								src="/litepaper/sovereign.webp"
								alt="Fine-tuned AI agent"
								className="relative aspect-[3/4] rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]"
								imageClassName="object-cover object-center"
								sizes="(min-width: 1024px) 38vw, 100vw"
							>
								<div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[rgba(8,8,10,0.3)] to-transparent" />
								<div className="absolute inset-x-0 bottom-0 p-6">
									<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.85)] p-5">
										<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
											fine-tuning
										</span>
										<p className="mt-3 text-sm leading-6 text-[#a1a1aa]">
											take a base model. train it on your character's personality, knowledge, and style. now it doesn't
											need instructions. it just IS that character.
										</p>
									</div>
								</div>
							</VisualAsset>
						</div>
					</SectionBlock>

					{/* Right — text */}
					<div className="lg:col-span-7">
						<SectionBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								what's different
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								fees fund <span className="text-[#00ff87]">fine-tuning.</span>
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								on waifu.fun, trading fees don't just disappear into a treasury. they pay for training runs that make
								your agent's model better.
							</p>
							<p className="mt-4 text-[#a1a1aa] text-lg leading-relaxed">
								here's the difference: a system prompt tells a model "you are a cat girl named luna." fine-tuning
								actually rewires the model so it thinks like luna, talks like luna, remembers like luna. the personality
								isn't a mask. it's baked in.
							</p>
						</SectionBlock>

						{/* Highlight callout */}
						<SectionBlock delay={0.1}>
							<div className="mt-10 rounded-sm border border-[rgba(0,255,135,0.15)] bg-[rgba(0,255,135,0.04)] p-6 sm:p-8 relative overflow-hidden">
								<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
								<p className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#00ff87] lowercase">
									not prompted. trained.
								</p>
								<p className="mt-4 text-base leading-7 text-[#a1a1aa]">
									a system prompt reads the character sheet every conversation and forgets between sessions. a
									fine-tuned model doesn't need the character sheet. it already knows who it is.
								</p>
							</div>
						</SectionBlock>

						{/* Comparison points */}
						<SectionBlock delay={0.2}>
							<div className="mt-8 grid gap-3 sm:grid-cols-2">
								{[
									"every other platform: same model, different costume",
									"waifu.fun: different model for each character",
									"training data: conversations, personality, style, lore",
									"result: your waifu is the only one like it",
								].map((point) => (
									<div
										key={point}
										className="group rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 hover:border-[rgba(0,255,135,0.2)] transition-colors duration-300"
									>
										<div className="flex items-start gap-3">
											<div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00ff87]" />
											<p className="text-sm leading-6 text-[#a1a1aa]">{point}</p>
										</div>
									</div>
								))}
							</div>
						</SectionBlock>
					</div>
				</div>
			</div>
		</section>
	);
}
