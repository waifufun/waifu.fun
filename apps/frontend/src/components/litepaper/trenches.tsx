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

const problems = [
	{
		title: "fees go nowhere",
		copy: "you trade on a launchpad. platform takes 1% on every trade. that money goes to the platform's treasury. it doesn't make your token better, doesn't improve the product, doesn't come back to you.",
	},
	{
		title: "agents are all the same",
		copy: "the AI agent meta added characters to tokens. but every single one runs on the same model with a different system prompt. your \"unique AI agent\" is literally ChatGPT in a costume. so is everyone else's.",
	},
	{
		title: "nothing compounds",
		copy: "a token launches hot, trades for a week, dies. the agent never gets better. there's no reason for it to. nothing from the trading activity flows back into improving what the token actually does.",
	},
];

export default function Trenches() {
	return (
		<section className="relative py-24 sm:py-32 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 80% 20%, rgba(0,255,135,0.03) 0%, transparent 40%)" }}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left column — header + context */}
					<div className="lg:col-span-5">
						<SectionBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								the problem
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								launchpads extract.{" "}
								<span className="text-[#52525b]">they don't build.</span>
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								you know how this works. token launches on a bonding curve. people trade. platform takes fees. devs take profit. token dies. next.
							</p>
							<p className="mt-4 text-[#a1a1aa] text-lg leading-relaxed">
								the AI agent wave added a new spin: now your token has a chatbot. but it's the same chatbot as every other token, running on the same rented model. the "AI" part is a gimmick, not a product.
							</p>

							<div className="mt-10 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60">
									current state
								</span>
								<div className="mt-4 flex flex-wrap gap-4 font-mono text-sm text-[#71717a]">
									<span>fees = extracted</span>
									<span>agents = identical</span>
									<span>improvement = zero</span>
								</div>
							</div>
						</SectionBlock>
					</div>

					{/* Right column — problem cards */}
					<div className="lg:col-span-7">
						<div className="grid gap-5">
							{problems.map((problem, index) => (
								<SectionBlock key={problem.title} delay={index * 0.1}>
									<motion.article
										className="group relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7 hover:border-[rgba(0,255,135,0.2)] transition-colors duration-300"
									>
										<div className="flex items-start gap-5">
											<div className="flex-shrink-0 w-12 h-12 rounded-sm bg-[rgba(0,255,135,0.05)] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
												<span className="font-mono text-sm text-[#52525b]">
													{String(index + 1).padStart(2, "0")}
												</span>
											</div>
											<div>
												<h3 className="text-xl sm:text-2xl font-bold text-[#e4e4e7] tracking-[-0.02em] lowercase group-hover:text-[#00ff87] transition-colors duration-300">
													{problem.title}
												</h3>
												<p className="mt-3 text-base leading-7 text-[#a1a1aa]">
													{problem.copy}
												</p>
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
