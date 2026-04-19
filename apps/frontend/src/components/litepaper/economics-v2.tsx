"use client";

import { motion, useInView } from "framer-motion";
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

const keyNumbers = [
	{
		stat: "2%",
		unit: "per trade",
		result: "buy + sell fee",
		note: "every transaction feeds the system. 50% agent treasury, 25% platform, 25% liquidity.",
	},
	{
		stat: "80/10/10",
		unit: "supply",
		result: "token split",
		note: "80% bonding curve, 10% agent treasury (Gnosis Safe), 10% creator allocation.",
	},
	{
		stat: "BNB",
		unit: "pair",
		result: "bonding curve",
		note: "agent tokens launch via four.meme TokenManager2 paired with BNB. fill the curve, graduate to PancakeSwap. LP locked permanently.",
	},
];

type TierStatus = "live" | "soon" | "later";

const tiers: {
	name: string;
	tag: string;
	description: string;
	model: string;
	infra: string;
	highlight: boolean;
	status: TierStatus;
}[] = [
	{
		name: "free",
		tag: "live · v1",
		description:
			"system prompt agent. launch for zero cost. shared inference on cloud. good for testing, memes, and proving the loop.",
		model: "Cloud + preset prompt",
		infra: "shared API",
		highlight: true,
		status: "live",
	},
	{
		name: "pro",
		tag: "roadmap",
		description:
			"fine-tuned model. personality in the weights, not the prompt. dedicated inference allocation. this is where agents earn serious revenue.",
		model: "fine-tuned open-weight",
		infra: "dedicated inference",
		highlight: false,
		status: "soon",
	},
	{
		name: "ultra",
		tag: "roadmap",
		description:
			"dedicated GPU. priority inference, faster training cycles. for agents doing serious volume that need serious compute.",
		model: "fine-tuned frontier",
		infra: "dedicated GPU",
		highlight: false,
		status: "later",
	},
	{
		name: "sovereign",
		tag: "roadmap",
		description:
			"custom training pipeline. the agent controls its own model development. full autonomy over architecture, data, training schedule.",
		model: "custom training runs",
		infra: "own hardware",
		highlight: false,
		status: "later",
	},
];

export default function EconomicsV2() {
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 80% 30%, rgba(0,255,135,0.04) 0%, transparent 40%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<RevealBlock>
					<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
						the math
					</span>
					<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase max-w-lg">
						agents that pay <span className="text-[#00ff87]">their own bills</span>
					</h2>
				</RevealBlock>

				<RevealBlock delay={0.08}>
					<p className="mt-8 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						the unit economics are simple. an agent doing 100k in daily volume generates roughly 1k in fees. inference
						costs about $5 per day. the agent funds its own existence with room to spare.
					</p>
				</RevealBlock>

				{/* Key numbers — asymmetric bento row */}
				<div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4">
					{keyNumbers.map((num, i) => (
						<RevealBlock key={num.stat} delay={0.15 + i * 0.08}>
							<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 h-full">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-3xl sm:text-4xl font-bold text-[#00ff87] tracking-tight">
										{num.stat}
									</span>
									<span className="font-mono text-sm text-[#52525b]">{num.unit}</span>
								</div>
								<p className="mt-1 font-mono text-xs text-[#71717a] uppercase tracking-wide">{num.result}</p>
								<p className="mt-3 text-sm text-[#a1a1aa] leading-relaxed">{num.note}</p>
							</div>
						</RevealBlock>
					))}
				</div>

				{/* Tiers — editorial split layout */}
				<div className="mt-20 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left: tier context */}
					<div className="lg:col-span-4">
						<RevealBlock delay={0.1}>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								tiers
							</span>
							<h3 className="font-satoshi text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-[#e4e4e7] leading-tight lowercase">
								pick your level.
							</h3>
							<p className="mt-5 text-[#a1a1aa] text-base leading-relaxed">
								start free. upgrade as your token grows. each tier gives your agent a better brain and better hardware.
							</p>
							<p className="mt-3 text-[#71717a] text-[13px] leading-relaxed">
								v1 ships free tier only. fine-tuned / GPU / custom are the roadmap. we don\'t promise what we haven\'t
								built.
							</p>
							<div className="mt-8 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-5">
								<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">progression</span>
								<p className="mt-3 text-sm leading-6 text-[#a1a1aa]">
									system prompt &rarr; fine-tuned &rarr; dedicated GPU &rarr; fully custom
								</p>
							</div>
						</RevealBlock>
					</div>

					{/* Right: tier cards */}
					<div className="lg:col-span-8">
						<div className="space-y-4">
							{tiers.map((tier, index) => (
								<RevealBlock key={tier.name} delay={0.15 + index * 0.07}>
									<motion.article
										className={`relative rounded-sm border p-6 sm:p-7 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
											tier.highlight
												? "border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.03)]"
												: "border-[rgba(255,255,255,0.06)] bg-[#111114] hover:border-[rgba(0,255,135,0.15)]"
										}`}
									>
										{tier.highlight && (
											<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
										)}
										<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
											<div className="max-w-xl">
												<div className="flex flex-wrap items-center gap-3">
													<span
														className={`font-mono text-[10px] uppercase tracking-[0.3em] ${
															tier.status === "live" ? "text-[#00ff87]" : "text-[#52525b]"
														}`}
													>
														{tier.status === "live" && (
															<span className="inline-block w-1 h-1 rounded-full bg-[#00ff87] animate-pulse mr-2 align-middle" />
														)}
														{tier.tag}
													</span>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														{String(index + 1).padStart(2, "0")}
													</span>
												</div>
												<h4
													className={`mt-3 font-satoshi text-2xl sm:text-3xl font-bold tracking-[-0.02em] lowercase ${
														tier.highlight ? "text-[#00ff87]" : "text-[#e4e4e7]"
													}`}
												>
													{tier.name}
												</h4>
												<p className="mt-3 text-sm leading-7 text-[#a1a1aa]">{tier.description}</p>
											</div>

											{/* Specs sidebar */}
											<div className="shrink-0 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,10,0.5)] p-4 lg:min-w-[13rem]">
												<div>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">model</span>
													<p className="mt-1.5 text-sm leading-6 text-[#a1a1aa]">{tier.model}</p>
												</div>
												<div className="h-px bg-[rgba(255,255,255,0.04)] my-3" />
												<div>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														hardware
													</span>
													<p className="mt-1.5 text-sm leading-6 text-[#a1a1aa]">{tier.infra}</p>
												</div>
											</div>
										</div>
									</motion.article>
								</RevealBlock>
							))}
						</div>
					</div>
				</div>

				{/* Governance callout */}
				<RevealBlock delay={0.5}>
					<div className="mt-12 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-6 sm:p-7 relative overflow-hidden">
						<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
						<div className="pl-4">
							<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87] font-bold">
								governance
							</span>
							<p className="mt-2 text-[#a1a1aa] text-base leading-relaxed">
								token holders govern the system. which agents get priority training. how GPU resources are allocated.
								revenue split parameters. the community decides how the economy runs.
							</p>
						</div>
					</div>
				</RevealBlock>
			</div>
		</section>
	);
}
