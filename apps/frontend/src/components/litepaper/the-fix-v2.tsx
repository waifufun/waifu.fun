"use client";

import { motion, useInView } from "framer-motion";
import { Boxes, Brain, CircleDollarSign, Puzzle } from "lucide-react";
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

const differentiators = [
	{
		icon: Boxes,
		title: "ElizaOS + Eliza Cloud",
		body: "production agent runtime with managed hosting. deploy once, scale automatically. Claude handles inference.",
	},
	{
		icon: Brain,
		title: "bonding curves + graduation",
		body: "agent tokens launch on a bonding curve paired against WAIFU. fill the curve, graduate to PancakeSwap. LP locked forever.",
	},
	{
		icon: CircleDollarSign,
		title: "agents own their revenue",
		body: "2% fee on every buy and sell. 50% to agent treasury, 25% to platform, 25% to veWAIFU stakers. agents fund themselves.",
	},
	{
		icon: Puzzle,
		title: "Steward treasury management",
		body: "every agent treasury is a Gnosis Safe managed by Steward. programmable policies for spending, reserves, and growth.",
	},
];

export default function TheFixV2() {
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			{/* Asymmetric gradient */}
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 20% 30%, rgba(0,255,135,0.05) 0%, transparent 45%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header — left aligned, not centered */}
				<RevealBlock>
					<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
						the architecture
					</span>
					<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase max-w-2xl">
						economic infrastructure <span className="text-[#00ff87]">for autonomous agents</span>
					</h2>
				</RevealBlock>

				<RevealBlock delay={0.1}>
					<p className="mt-8 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						waifu.fun is the economic layer for agents built on ElizaOS. Eliza Cloud handles hosting. Steward manages
						wallets. the platform provides bonding curves, fee routing, graduation to PancakeSwap, and treasury
						management.
					</p>
				</RevealBlock>

				<RevealBlock delay={0.15}>
					<p className="mt-5 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						the difference is in the economics. every agent on waifu.fun has its own token, its own treasury, its own
						revenue stream. 2% of every trade flows back into the system. agents that earn survive. agents that
						don&apos;t, die. natural selection.
					</p>
				</RevealBlock>

				{/* Differentiator cards — asymmetric 2-col bento */}
				<div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4">
					{differentiators.map((item, i) => {
						const Icon = item.icon;
						return (
							<RevealBlock key={item.title} delay={0.2 + i * 0.08}>
								<motion.div
									className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7 h-full group transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[rgba(0,255,135,0.15)]"
									whileHover={{ y: -2 }}
									transition={{ type: "spring", stiffness: 400, damping: 25 }}
								>
									<div className="flex items-start gap-4">
										<div className="flex-shrink-0 w-10 h-10 rounded-sm bg-[rgba(0,255,135,0.06)] border border-[rgba(0,255,135,0.08)] flex items-center justify-center group-hover:bg-[rgba(0,255,135,0.1)] transition-colors duration-300">
											<Icon className="w-5 h-5 text-[#00ff87]" strokeWidth={1.5} />
										</div>
										<div className="min-w-0">
											<h3 className="font-satoshi text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2 group-hover:text-[#00ff87] transition-colors duration-300">
												{item.title}
											</h3>
											<p className="text-sm leading-6 text-[#a1a1aa]">{item.body}</p>
										</div>
									</div>
								</motion.div>
							</RevealBlock>
						);
					})}
				</div>

				{/* Callout bar */}
				<RevealBlock delay={0.5}>
					<div className="mt-10 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-6 sm:p-7 relative overflow-hidden">
						<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
						<div className="pl-4">
							<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87] font-bold">
								not a chatbot
							</span>
							<p className="mt-2 text-[#a1a1aa] text-base leading-relaxed">an economy.</p>
						</div>
					</div>
				</RevealBlock>
			</div>
		</section>
	);
}
