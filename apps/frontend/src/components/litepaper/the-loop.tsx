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

const steps = [
	{ id: "01", label: "someone launches a waifu token" },
	{ id: "02", label: "people trade it on the bonding curve" },
	{ id: "03", label: "trading fees accumulate" },
	{ id: "04", label: "fees fund a fine-tuning run" },
	{ id: "05", label: "the agent gets a better model" },
	{ id: "06", label: "better agent attracts more traders" },
];

const governance = [
	"which waifus get the next training run",
	"how fees split between training and inference",
	"what base models to fine-tune on",
	"platform features and roadmap",
];

export default function TheLoop() {
	const diagramRef = useRef(null);
	const diagramInView = useInView(diagramRef, { once: true, margin: "-50px" });

	return (
		<section className="relative py-24 sm:py-32 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{ background: "radial-gradient(ellipse at 22% 25%, rgba(0,255,135,0.04) 0%, transparent 40%)" }}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left column */}
					<div className="lg:col-span-5">
						<SectionBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								the loop
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								trade more,{" "}
								<span className="text-[#00ff87]">learn more.</span>
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								this is the part that matters. trading fees don't go to a team wallet. they go to GPU time. every trade makes the agent a little smarter.
							</p>
						</SectionBlock>

						{/* The cycle — step list */}
						<SectionBlock delay={0.1}>
							<div className="mt-10 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
									the cycle
								</span>
								<div className="mt-6 grid gap-3">
									{steps.map((step, index) => (
										<div key={step.id} className="flex items-center gap-4">
											<div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[rgba(0,255,135,0.05)] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
												<span className="font-mono text-[10px] text-[#52525b]">{step.id}</span>
											</div>
											<div className="flex flex-1 items-center gap-3 rounded-sm border border-[rgba(255,255,255,0.04)] bg-[rgba(8,8,10,0.5)] px-4 py-2.5">
												<p className="text-sm text-[#a1a1aa]">{step.label}</p>
												{index < steps.length - 1 && (
													<motion.div
														animate={{ x: [0, 6, 0], opacity: [0.2, 0.6, 0.2] }}
														transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: index * 0.1 }}
														className="ml-auto h-px w-6 bg-gradient-to-r from-transparent via-[#00ff87]/40 to-transparent"
													/>
												)}
											</div>
										</div>
									))}
								</div>
								<p className="mt-6 text-center text-sm text-[#52525b]">
									then it loops. the popular ones keep getting smarter.
								</p>
							</div>
						</SectionBlock>

						{/* Governance */}
						<SectionBlock delay={0.2}>
							<div className="mt-5 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-6 sm:p-7 relative overflow-hidden">
								<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#71717a] pl-3">
									token holders decide
								</span>
								<div className="mt-4 grid gap-3 pl-3">
									{governance.map((item) => (
										<div key={item} className="flex items-start gap-3">
											<div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00ff87]" />
											<p className="text-sm leading-6 text-[#a1a1aa]">{item}</p>
										</div>
									))}
								</div>
							</div>
						</SectionBlock>
					</div>

					{/* Right column — flywheel diagram */}
					<div className="lg:col-span-7">
						<SectionBlock delay={0.15}>
							<div className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#0e0e11] p-4 lg:p-6">
								<VisualAsset
									src="/litepaper/economy.webp"
									alt="The waifu.fun training flywheel"
									className="relative min-h-[38rem] rounded-sm border border-[rgba(255,255,255,0.04)] bg-[#111114] lg:min-h-[48rem]"
									imageClassName="object-cover object-center opacity-[0.15]"
									sizes="(min-width: 1024px) 48vw, 100vw"
								>
									<div className="absolute inset-0 p-5 sm:p-8">
										<div className="flex items-center justify-between">
											<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
												the flywheel
											</span>
										</div>

										{/* Animated cycle rings */}
										<div ref={diagramRef} className="absolute inset-0 flex items-center justify-center">
											<div className="relative h-[22rem] w-[22rem] sm:h-[28rem] sm:w-[28rem]">
												<motion.div
													animate={{ rotate: 360 }}
													transition={{ duration: 30, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
													className="absolute inset-0 rounded-full border border-[rgba(0,255,135,0.1)]"
												/>
												<motion.div
													animate={{ rotate: -360 }}
													transition={{ duration: 22, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
													className="absolute inset-[12%] rounded-full border border-[rgba(0,255,135,0.06)]"
												/>
												<div className="absolute inset-[24%] rounded-full border border-[rgba(255,255,255,0.04)]" />

												{/* Orbiting dots */}
												{[0, 1, 2].map((i) => (
													<motion.div
														key={i}
														animate={{ rotate: 360 }}
														transition={{
															duration: 12 + i * 4,
															repeat: Number.POSITIVE_INFINITY,
															ease: "linear",
															delay: i * 1.5,
														}}
														className="absolute inset-[6%]"
													>
														<div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#00ff87]" />
													</motion.div>
												))}

												{/* Center hub */}
												<div className="absolute inset-[30%] flex items-center justify-center rounded-full border border-[rgba(0,255,135,0.15)] bg-[#0e0e11]">
													<div className="text-center px-4">
														<p className="font-mono text-sm uppercase tracking-[0.2em] text-[#00ff87]">trade</p>
														<p className="mt-1 font-mono text-sm uppercase tracking-[0.2em] text-[#52525b]">train</p>
														<p className="mt-1 font-mono text-sm uppercase tracking-[0.2em] text-[#00ff87]">repeat</p>
													</div>
												</div>

												{/* Labels */}
												<motion.div
													initial={{ opacity: 0, scale: 0 }}
													animate={diagramInView ? { opacity: 1, scale: 1 } : {}}
													transition={{ delay: 0.3, type: "spring" }}
													className="absolute left-1/2 top-[2%] -translate-x-1/2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-3 py-1.5"
												>
													<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa]">people trade</p>
												</motion.div>
												<motion.div
													initial={{ opacity: 0, scale: 0 }}
													animate={diagramInView ? { opacity: 1, scale: 1 } : {}}
													transition={{ delay: 0.5, type: "spring" }}
													className="absolute right-[2%] top-1/2 -translate-y-1/2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-3 py-1.5"
												>
													<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]">fees accrue</p>
												</motion.div>
												<motion.div
													initial={{ opacity: 0, scale: 0 }}
													animate={diagramInView ? { opacity: 1, scale: 1 } : {}}
													transition={{ delay: 0.7, type: "spring" }}
													className="absolute bottom-[2%] left-1/2 -translate-x-1/2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-3 py-1.5"
												>
													<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a1a1aa]">model trains</p>
												</motion.div>
												<motion.div
													initial={{ opacity: 0, scale: 0 }}
													animate={diagramInView ? { opacity: 1, scale: 1 } : {}}
													transition={{ delay: 0.9, type: "spring" }}
													className="absolute left-[2%] top-1/2 -translate-y-1/2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-3 py-1.5"
												>
													<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]">waifu improves</p>
												</motion.div>
											</div>
										</div>
									</div>
								</VisualAsset>
							</div>
						</SectionBlock>
					</div>
				</div>
			</div>
		</section>
	);
}
