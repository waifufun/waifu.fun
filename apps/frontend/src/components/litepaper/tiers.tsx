"use client";

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

const tiers = [
	{
		name: "free",
		tag: "start here",
		description: "base model with a system prompt. works like every other platform. good enough to launch and see if people like your character.",
		model: "shared model + prompt",
		infra: "shared API",
		highlight: false,
	},
	{
		name: "pro",
		tag: "fine-tuned",
		description: "your waifu gets its own fine-tuned model. personality is in the weights, not a prompt. this is where it stops being a chatbot and starts being a character.",
		model: "fine-tuned open-weight",
		infra: "shared GPU pool",
		highlight: false,
	},
	{
		name: "ultra",
		tag: "dedicated",
		description: "fine-tuned on a frontier model with its own GPU. faster responses, smarter conversations, more capable across the board.",
		model: "fine-tuned frontier",
		infra: "dedicated GPU",
		highlight: false,
	},
	{
		name: "sovereign",
		tag: "fully custom",
		description: "custom training runs on your own hardware. token-gated access. this waifu is a different species.",
		model: "custom training runs",
		infra: "own hardware",
		highlight: true,
	},
];

export default function Tiers() {
	return (
		<section className="relative py-24 sm:py-32 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 18% 20%, rgba(0,255,135,0.03) 0%, transparent 40%)" }}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left — header */}
					<div className="lg:col-span-4">
						<SectionBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								tiers
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								pick your level.
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								start free. upgrade as your token grows. each tier gives your waifu a better brain and better hardware.
							</p>
							<div className="mt-10 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
									how it scales
								</span>
								<p className="mt-4 text-base leading-7 text-[#a1a1aa]">
									system prompt &rarr; fine-tuned &rarr; dedicated GPU &rarr; fully custom
								</p>
							</div>
						</SectionBlock>
					</div>

					{/* Right — tier cards */}
					<div className="lg:col-span-8">
						<div className="grid gap-5">
							{tiers.map((tier, index) => (
								<SectionBlock key={tier.name} delay={index * 0.08}>
									<motion.article
										className={`relative rounded-sm border p-6 sm:p-7 transition-colors duration-300 ${
											tier.highlight
												? "border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.03)]"
												: "border-[rgba(255,255,255,0.06)] bg-[#111114] hover:border-[rgba(0,255,135,0.2)]"
										}`}
									>
										{tier.highlight && (
											<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
										)}
										<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
											<div className="max-w-xl">
												<div className="flex flex-wrap items-center gap-3">
													<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
														{tier.tag}
													</span>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														{String(index + 1).padStart(2, "0")}
													</span>
												</div>
												<h3 className={`mt-4 text-2xl sm:text-3xl font-bold tracking-[-0.02em] lowercase ${
													tier.highlight ? "text-[#00ff87]" : "text-[#e4e4e7]"
												}`}>
													{tier.name}
												</h3>
												<p className="mt-4 text-base leading-7 text-[#a1a1aa]">{tier.description}</p>
											</div>

											{/* Specs sidebar */}
											<div className="shrink-0 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,10,0.5)] p-4 lg:min-w-[14rem]">
												<div>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														model
													</span>
													<p className="mt-2 text-sm leading-6 text-[#a1a1aa]">{tier.model}</p>
												</div>
												<div className="h-px bg-[rgba(255,255,255,0.04)] my-3" />
												<div>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														hardware
													</span>
													<p className="mt-2 text-sm leading-6 text-[#a1a1aa]">{tier.infra}</p>
												</div>
											</div>
										</div>
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
