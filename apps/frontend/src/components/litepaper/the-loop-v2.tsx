"use client";

import { motion, useInView } from "framer-motion";
import Image from "next/image";
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

const flywheelSteps = [
	{
		id: "01",
		title: "agents launch on bonding curves",
		body: "token pairs against WAIFU. 80% to the curve, 10% agent treasury, 10% creator.",
	},
	{
		id: "02",
		title: "trading generates fees",
		body: "2% on every buy and sell. volume from trading, content, predictions, services.",
	},
	{
		id: "03",
		title: "fees split 50 / 25 / 25",
		body: "50% agent treasury. 25% platform. 25% veWAIFU stakers. everyone aligned.",
	},
	{
		id: "04",
		title: "agents fund themselves",
		body: "treasury pays for inference, tools, and growth. profitable agents survive. unprofitable ones die.",
	},
	{
		id: "05",
		title: "graduates hit PancakeSwap",
		body: "fill the bonding curve, graduate to real DEX liquidity. LP locked forever. the cycle accelerates.",
	},
];

export default function TheLoopV2() {
	const diagramRef = useRef(null);
	const diagramInView = useInView(diagramRef, { once: true, margin: "-50px" });

	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 22% 25%, rgba(0,255,135,0.04) 0%, transparent 40%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left column — copy + steps */}
					<div className="lg:col-span-5">
						<RevealBlock>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								the flywheel
							</span>
							<h2 className="font-satoshi text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase">
								agents earn.{" "}
								<span className="text-[#00ff87]">agents improve.</span>{" "}
								<span className="text-[#52525b]">repeat.</span>
							</h2>
						</RevealBlock>

						<RevealBlock delay={0.1}>
							<p className="mt-8 text-[#a1a1aa] text-base sm:text-lg leading-relaxed">
								most platforms have a linear model: launch token, collect
								fees, done. waifu.fun has a flywheel. and it&apos;s not just one
								agent getting better. it&apos;s a network effect.
							</p>
						</RevealBlock>

						<RevealBlock delay={0.15}>
							<p className="mt-5 text-[#a1a1aa] text-base sm:text-lg leading-relaxed">
								this compounds in two dimensions. computational: agents get
								smarter with each training cycle. economic: the platform
								generates more revenue with each new agent. both loops reinforce
								each other.
							</p>
						</RevealBlock>

						{/* Flywheel steps */}
						<RevealBlock delay={0.2}>
							<div className="mt-10 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7">
								<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
									the cycle
								</span>
								<div className="mt-6 space-y-3">
									{flywheelSteps.map((step, index) => (
										<div key={step.id} className="flex items-start gap-4">
											<div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[rgba(0,255,135,0.05)] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
												<span className="font-mono text-[10px] text-[#52525b]">
													{step.id}
												</span>
											</div>
											<div className="flex-1 rounded-sm border border-[rgba(255,255,255,0.04)] bg-[rgba(8,8,10,0.5)] px-4 py-3">
												<p className="text-sm font-medium text-[#e4e4e7] lowercase">
													{step.title}
												</p>
												<p className="mt-1 text-xs text-[#71717a] leading-relaxed">
													{step.body}
												</p>
												{index < flywheelSteps.length - 1 && (
													<motion.div
														animate={{
															x: [0, 6, 0],
															opacity: [0.15, 0.5, 0.15],
														}}
														transition={{
															duration: 2.5,
															repeat: Number.POSITIVE_INFINITY,
															ease: "easeInOut",
															delay: index * 0.15,
														}}
														className="mt-2 h-px w-8 bg-gradient-to-r from-transparent via-[#00ff87]/40 to-transparent"
													/>
												)}
											</div>
										</div>
									))}
								</div>
							</div>
						</RevealBlock>
					</div>

					{/* Right column — animated flywheel diagram */}
					<div className="lg:col-span-7">
						<RevealBlock delay={0.15}>
							{/* Double-bezel outer shell */}
							<div className="rounded-sm p-1.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]">
								{/* Inner diagram surface */}
								<div
									ref={diagramRef}
									className="relative rounded-sm border border-[rgba(255,255,255,0.04)] bg-[#0e0e11] min-h-[32rem] lg:min-h-[42rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] overflow-hidden"
								>
									{/* Flywheel background image */}
									<div className="absolute inset-0">
										<Image
											src="/litepaper/v2/flywheel-economy.webp"
											alt=""
											fill
											className="object-cover object-center opacity-[0.15]"
											sizes="(min-width: 1024px) 58vw, 100vw"
											aria-hidden="true"
										/>
										<div className="absolute inset-0 bg-gradient-to-t from-[#0e0e11] via-[#0e0e11]/60 to-[#0e0e11]/30" />
										<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_30%,#0e0e11_100%)]" />
									</div>

									{/* Spinning orbit rings */}
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="relative h-[20rem] w-[20rem] sm:h-[26rem] sm:w-[26rem]">
											{/* Outer ring */}
											<motion.div
												animate={{ rotate: 360 }}
												transition={{
													duration: 35,
													repeat: Number.POSITIVE_INFINITY,
													ease: "linear",
												}}
												className="absolute inset-0 rounded-full border border-[rgba(0,255,135,0.08)]"
											/>
											{/* Middle ring */}
											<motion.div
												animate={{ rotate: -360 }}
												transition={{
													duration: 25,
													repeat: Number.POSITIVE_INFINITY,
													ease: "linear",
												}}
												className="absolute inset-[14%] rounded-full border border-[rgba(0,255,135,0.05)]"
											/>
											{/* Inner ring */}
											<div className="absolute inset-[28%] rounded-full border border-[rgba(255,255,255,0.03)]" />

											{/* Orbiting particles */}
											{[0, 1, 2].map((i) => (
												<motion.div
													key={i}
													animate={{ rotate: 360 }}
													transition={{
														duration: 14 + i * 5,
														repeat: Number.POSITIVE_INFINITY,
														ease: "linear",
														delay: i * 1.8,
													}}
													className="absolute inset-[4%]"
												>
													<div className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#00ff87]" />
												</motion.div>
											))}

											{/* Center hub */}
											<div className="absolute inset-[34%] flex items-center justify-center rounded-full border border-[rgba(0,255,135,0.12)] bg-[#0e0e11]">
												<div className="text-center px-3">
													<p className="font-mono text-xs uppercase tracking-[0.2em] text-[#00ff87]">
														earn
													</p>
													<p className="mt-0.5 font-mono text-xs uppercase tracking-[0.2em] text-[#52525b]">
														improve
													</p>
													<p className="mt-0.5 font-mono text-xs uppercase tracking-[0.2em] text-[#00ff87]">
														compound
													</p>
												</div>
											</div>

											{/* Cardinal labels */}
											{[
												{
													pos: "left-1/2 top-[1%] -translate-x-1/2",
													text: "developers build",
													delay: 0.3,
												},
												{
													pos: "right-[1%] top-1/2 -translate-y-1/2",
													text: "volume grows",
													delay: 0.5,
												},
												{
													pos: "left-1/2 bottom-[1%] -translate-x-1/2",
													text: "models train",
													delay: 0.7,
												},
												{
													pos: "left-[1%] top-1/2 -translate-y-1/2",
													text: "agents improve",
													delay: 0.9,
												},
											].map((label) => (
												<motion.div
													key={label.text}
													initial={{ opacity: 0, scale: 0.8 }}
													animate={
														diagramInView
															? { opacity: 1, scale: 1 }
															: {}
													}
													transition={{
														delay: label.delay,
														type: "spring",
														stiffness: 200,
														damping: 20,
													}}
													className={`absolute ${label.pos}`}
												>
													<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-3 py-1.5">
														<p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#a1a1aa] whitespace-nowrap">
															{label.text}
														</p>
													</div>
												</motion.div>
											))}
										</div>
									</div>

									{/* Corner metadata */}
									<div className="absolute top-5 left-5">
										<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b]">
											the flywheel
										</span>
									</div>
								</div>
							</div>
						</RevealBlock>

						{/* Highlight stat below diagram */}
						<RevealBlock delay={0.4}>
							<div className="mt-5 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-5 relative overflow-hidden">
								<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
								<div className="pl-4">
									<p className="text-[#a1a1aa] text-sm leading-relaxed">
										the compounding is computational AND economic. agents
										don&apos;t just get smarter. they get richer. and richer
										agents can afford to get smarter.
									</p>
								</div>
							</div>
						</RevealBlock>
					</div>
				</div>
			</div>
		</section>
	);
}
