"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import VisualAsset from "@/components/litepaper/visual-asset";

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
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_25%,rgba(0,255,135,0.07),transparent_22%),radial-gradient(circle_at_82%_20%,rgba(0,200,255,0.08),transparent_18%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-12">
				{/* Left column */}
				<div className="lg:col-span-5">
					<motion.div
						initial={{ opacity: 0, y: 28 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					>
						<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">the loop</p>
						<h2 className="mt-6 font-orbitron text-[clamp(2.4rem,5vw,5.5rem)] uppercase leading-[0.93] tracking-[-0.05em] text-white">
							trade more,
							<span className="block text-waifu-green [text-shadow:0_0_26px_rgba(0,255,135,0.2)]">learn more.</span>
						</h2>
						<p className="mt-8 max-w-2xl font-satoshi text-lg leading-8 text-white/66 sm:text-[1.18rem]">
							this is the part that matters. trading fees don't go to a team wallet. they go to GPU time. every trade makes the agent a little smarter.
						</p>
					</motion.div>

					{/* Steps */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.2 }}
						transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-10 rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-7"
					>
						<p className="font-orbitron text-[11px] uppercase tracking-[0.34em] text-white/46">the cycle</p>
						<div className="mt-6 grid gap-4">
							{steps.map((step, index) => (
								<div key={step.id} className="flex items-center gap-4">
									<div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/58" style={{ fontFamily: "DMMono, monospace" }}>
										<span className="text-xs">{step.id}</span>
									</div>
									<div className="flex flex-1 items-center gap-3 rounded-full border border-white/8 bg-black/20 px-4 py-2.5">
										<p className="font-satoshi text-sm text-white/72 sm:text-base">{step.label}</p>
										{index < steps.length - 1 && (
											<motion.div
												animate={{ x: [0, 8, 0], opacity: [0.3, 0.8, 0.3] }}
												transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: [0.45, 0, 0.55, 1], delay: index * 0.12 }}
												className="ml-auto h-px w-8 bg-gradient-to-r from-waifu-green/0 via-waifu-green/70 to-waifu-green/0"
											/>
										)}
									</div>
								</div>
							))}
						</div>
						<p className="mt-6 text-center font-satoshi text-sm text-white/45">
							then it loops. the popular ones keep getting smarter.
						</p>
					</motion.div>

					{/* Governance */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ delay: 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-6 rounded-[1.75rem] border border-waifu-green/15 bg-waifu-green/8 p-6 shadow-crt-sm sm:p-7"
					>
						<p className="text-[11px] uppercase tracking-[0.28em] text-white/52" style={{ fontFamily: "DMMono, monospace" }}>
							token holders decide
						</p>
						<div className="mt-4 grid gap-3">
							{governance.map((item) => (
								<div key={item} className="flex items-start gap-3">
									<div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-waifu-green shadow-[0_0_12px_rgba(0,255,135,0.6)]" />
									<p className="font-satoshi text-sm leading-6 text-white/68">{item}</p>
								</div>
							))}
						</div>
					</motion.div>
				</div>

				{/* Right column - visual */}
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.2 }}
					transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
					className="mt-16 lg:col-span-7 lg:mt-0"
				>
					<div className="relative overflow-hidden rounded-[2.3rem] border border-white/10 bg-white/[0.03] p-4 shadow-crt lg:p-6">
						<VisualAsset
							src="/litepaper/economy.webp"
							alt="The waifu.fun training flywheel"
							className="relative min-h-[38rem] rounded-[2rem] border border-white/8 bg-waifu-surface lg:min-h-[48rem]"
							imageClassName="object-cover object-center opacity-35"
							fallbackClassName="bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,135,0.12),transparent_18%)]"
							sizes="(min-width: 1024px) 48vw, 100vw"
						>
							<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.08),rgba(8,8,10,0.5))]" />
							<div className="absolute inset-0 p-5 sm:p-8">
								<div className="absolute left-6 top-6 rounded-full border border-white/10 bg-black/35 px-4 py-2 backdrop-blur-md sm:left-8 sm:top-8">
									<p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-white/46">the flywheel</p>
								</div>

								{/* Animated rings */}
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="relative h-[26rem] w-[26rem] sm:h-[34rem] sm:w-[34rem]">
										<motion.div
											animate={{ rotate: 360 }}
											transition={{ duration: 24, repeat: Number.POSITIVE_INFINITY, ease: [0.65, 0, 0.35, 1] }}
											className="absolute inset-0 rounded-full border border-waifu-green/20"
										/>
										<motion.div
											animate={{ rotate: -360 }}
											transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: [0.65, 0, 0.35, 1] }}
											className="absolute inset-[8%] rounded-full border border-white/10"
										/>
										<div className="absolute inset-[16%] rounded-full border border-white/8" />

										{/* Orbiting particles */}
										{[0, 1, 2, 3, 4].map((i) => (
											<motion.div
												key={i}
												animate={{ rotate: 360 }}
												transition={{
													duration: 10 + i * 2.5,
													repeat: Number.POSITIVE_INFINITY,
													ease: [0.65, 0, 0.35, 1],
													delay: i * 0.3,
												}}
												className="absolute inset-[10%]"
											>
												<div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-waifu-green shadow-[0_0_18px_rgba(0,255,135,0.9)]" />
											</motion.div>
										))}

										{/* Center */}
										<div className="absolute inset-[28%] flex items-center justify-center rounded-full border border-waifu-green/20 bg-black/55 shadow-crt backdrop-blur-xl">
											<div className="text-center px-4">
												<div className="relative mx-auto h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-white/5">
													<Image src="/brand/icon/icon_1024.png" alt="waifu.fun" fill className="object-cover" sizes="48px" />
												</div>
												<p className="mt-3 font-orbitron text-xs uppercase tracking-[0.3em] text-waifu-green">trade</p>
												<p className="mt-1 font-orbitron text-xs uppercase tracking-[0.3em] text-white/50">train</p>
												<p className="mt-1 font-orbitron text-xs uppercase tracking-[0.3em] text-waifu-green">repeat</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</VisualAsset>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
