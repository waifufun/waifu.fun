"use client";

import { motion, useInView } from "framer-motion";
import { Cloud, Cpu, Layers, Server, Wallet } from "lucide-react";
import { useRef } from "react";

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

const stackLayers = [
	{
		id: "01",
		icon: Layers,
		title: "ElizaOS",
		subtitle: "the agent framework",
		body: "the agent logic lives here. open-source runtime for autonomous agents. plugins, memory, reasoning.",
		accent: "#00ff87",
	},
	{
		id: "02",
		icon: Cloud,
		title: "Eliza Cloud",
		subtitle: "hosting + runtime",
		body: "managed infrastructure so developers focus on the agent, not the server. Claude handles inference. uptime, scaling, monitoring handled.",
		accent: "#00ff87",
	},
	{
		id: "03",
		icon: Wallet,
		title: "Steward",
		subtitle: "treasury management",
		body: "every agent treasury is a Gnosis Safe with programmable policies. Steward manages spending, reserves, and allocation. non-custodial.",
		accent: "#00ff87",
	},
	{
		id: "04",
		icon: Server,
		title: "BSC + Flap + PancakeSwap",
		subtitle: "bonding curves + graduation",
		body: "WAIFU launches on Flap. agent tokens pair against WAIFU on bonding curves. fill the curve (1-5M WAIFU bonded), graduate to PancakeSwap. LP locked permanently.",
		accent: "#00ff87",
	},
	{
		id: "05",
		icon: Cpu,
		title: "WAIFU token",
		subtitle: "the economic backbone",
		body: "one token unifies the whole system. stake WAIFU for veWAIFU to earn 25% of all platform fees. every agent token trades against it.",
		accent: "#00ff87",
	},
];

export default function TheStackV2() {
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 15% 50%, rgba(0,255,135,0.04) 0%, transparent 40%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header + stack in editorial split */}
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left: header + context */}
					<div className="lg:col-span-4">
						<RevealBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								under the hood
							</span>
							<h2 className="font-satoshi text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase">
								the infrastructure layer
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								five layers. each one does its job. none of them care what framework your agent uses.
							</p>
						</RevealBlock>

						{/* Powered-by callout */}
						<RevealBlock delay={0.15}>
							<div className="mt-10 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">powered by</span>
								<div className="mt-4 flex flex-wrap gap-3">
									{["ElizaOS", "Eliza Cloud", "Steward", "BSC native"].map((tag) => (
										<span
											key={tag}
											className="inline-flex px-3 py-1.5 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,10,0.5)] font-mono text-[10px] uppercase tracking-[0.15em] text-[#71717a]"
										>
											{tag}
										</span>
									))}
								</div>
							</div>
						</RevealBlock>
					</div>

					{/* Right: stack layers — vertical strip diagram */}
					<div className="lg:col-span-8">
						<div className="space-y-3">
							{stackLayers.map((layer, i) => {
								const Icon = layer.icon;
								return (
									<RevealBlock key={layer.id} delay={0.1 + i * 0.07}>
										<motion.div
											className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-5 sm:p-6 group hover:border-[rgba(0,255,135,0.15)] transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
											whileHover={{ x: 4 }}
											transition={{
												type: "spring",
												stiffness: 400,
												damping: 25,
											}}
										>
											{/* Connecting line to next layer */}
											{i < stackLayers.length - 1 && (
												<div className="absolute -bottom-3 left-8 w-px h-3 bg-gradient-to-b from-[rgba(0,255,135,0.2)] to-transparent" />
											)}

											<div className="flex items-start gap-5">
												<div className="flex-shrink-0">
													<div className="w-12 h-12 rounded-sm bg-[rgba(0,255,135,0.05)] border border-[rgba(0,255,135,0.08)] flex items-center justify-center group-hover:bg-[rgba(0,255,135,0.1)] transition-colors duration-300">
														<Icon className="w-5 h-5 text-[#00ff87]" strokeWidth={1.5} />
													</div>
												</div>
												<div className="min-w-0 flex-1">
													<div className="flex flex-wrap items-center gap-3">
														<span className="font-mono text-[10px] text-[#00ff87]/60 tracking-[0.2em]">
															L{layer.id}
														</span>
														<h3 className="font-satoshi text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase group-hover:text-[#00ff87] transition-colors duration-300">
															{layer.title}
														</h3>
													</div>
													<p className="mt-1 font-mono text-[11px] text-[#52525b] tracking-wide">{layer.subtitle}</p>
													<p className="mt-2.5 text-sm leading-6 text-[#a1a1aa]">{layer.body}</p>
												</div>
											</div>
										</motion.div>
									</RevealBlock>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
