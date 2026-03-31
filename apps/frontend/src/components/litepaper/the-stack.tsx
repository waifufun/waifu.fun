"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import VisualAsset from "@/components/litepaper/visual-asset";

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

const layers = [
	{
		id: "01",
		title: "ElizaOS",
		nickname: "the framework",
		copy: "open-source agent framework. built by hundreds of contributors. handles personality, memory, tool use, and multi-platform chat. the brain that runs every waifu.",
		link: "github.com/elizaos",
	},
	{
		id: "02",
		title: "Milady Cloud",
		nickname: "the hosting",
		copy: "each waifu gets its own container, its own runtime config, its own model endpoint. not a shared chatbot API. dedicated infrastructure per agent.",
	},
	{
		id: "03",
		title: "Steward",
		nickname: "the wallet",
		copy: "real crypto wallets for every agent. EVM and Solana. your waifu can receive fees, hold tokens, and spend autonomously. not a fake balance in a database.",
	},
	{
		id: "04",
		title: "Fine-Tuning Pipeline",
		nickname: "the training",
		copy: "conversation data, personality docs, and style examples go in. a custom model comes out. runs on open-weight bases so there are no vendor locks and no content filters you didn't choose.",
	},
	{
		id: "05",
		title: "GPU Compute",
		nickname: "the hardware",
		copy: "A100s and H100s on demand. fine-tuned models need real GPUs to run inference. scales up when your waifu is popular, scales down when it's quiet. you don't pay for idle hardware.",
	},
];

export default function TheStack() {
	return (
		<section className="relative py-24 sm:py-32 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 15% 30%, rgba(0,255,135,0.03) 0%, transparent 50%)" }}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<SectionBlock>
					<div className="max-w-2xl mb-16">
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
							the stack
						</span>
						<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
							what's under{" "}
							<span className="text-[#52525b]">the hood.</span>
						</h2>
						<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
							waifu.fun isn't a wrapper on someone else's API. it's a full stack built on open-source infrastructure that the community owns.
						</p>
					</div>
				</SectionBlock>

				{/* Flow indicator — desktop only */}
				<SectionBlock delay={0.1}>
					<div className="hidden lg:flex items-center gap-2 mb-12">
						{layers.map((layer, i) => (
							<div key={layer.id} className="flex items-center gap-2">
								<div className="px-3 py-1.5 rounded-sm bg-[#111114] border border-[rgba(255,255,255,0.06)] font-mono text-xs text-[#71717a]">
									{layer.title.split(" ")[0]}
								</div>
								{i < layers.length - 1 && (
									<motion.div
										className="text-[#00ff87]/40"
										animate={{ x: [0, 4, 0] }}
										transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: i * 0.2 }}
									>
										→
									</motion.div>
								)}
							</div>
						))}
					</div>
				</SectionBlock>

				{/* Two-column layout */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
					{/* Sticky image */}
					<div className="lg:col-span-5 lg:sticky lg:top-10">
						<SectionBlock delay={0.15}>
							<VisualAsset
								src="/litepaper/stack.webp"
								alt="The waifu.fun infrastructure stack"
								className="relative aspect-[3/4] rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]"
								imageClassName="object-cover object-center opacity-70"
								sizes="(min-width: 1024px) 36vw, 100vw"
							>
								<div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent" />
								<div className="absolute top-5 left-5 right-5 flex items-center justify-between">
									<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
										open source
									</span>
									<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
										5 layers
									</span>
								</div>
							</VisualAsset>
						</SectionBlock>
					</div>

					{/* Layer cards */}
					<div className="lg:col-span-7">
						<div className="grid gap-5">
							{layers.map((layer, index) => (
								<SectionBlock key={layer.id} delay={index * 0.08}>
									<motion.article
										className={`relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7 hover:border-[rgba(0,255,135,0.2)] transition-colors duration-300 ${
											index % 2 === 0 ? "lg:mr-8" : "lg:ml-8"
										}`}
									>
										<div className="flex flex-wrap items-center gap-3 mb-4">
											<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
												{layer.nickname}
											</span>
											<div className="h-px w-8 bg-[rgba(255,255,255,0.06)]" />
											<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
												{layer.id}
											</span>
										</div>
										<h3 className="text-2xl sm:text-3xl font-bold text-[#e4e4e7] tracking-[-0.02em] lowercase">
											{layer.title}
										</h3>
										<p className="mt-4 text-base leading-7 text-[#a1a1aa]">{layer.copy}</p>
										{layer.link && (
											<p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]/50">
												{layer.link}
											</p>
										)}
									</motion.article>
								</SectionBlock>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
