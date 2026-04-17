"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import VisualAsset from "@/components/litepaper/visual-asset";

const cycleNodes = [
	{ label: "Users interact", short: "01", position: "top-[9%] left-1/2 -translate-x-1/2" },
	{ label: "Fees accrue", short: "02", position: "right-[8%] top-[30%]" },
	{ label: "Training + inference", short: "03", position: "right-[14%] bottom-[16%]" },
	{ label: "Better waifus", short: "04", position: "left-[12%] bottom-[18%]" },
	{ label: "More users", short: "05", position: "left-[6%] top-[34%]" },
];

const governance = [
	"which waifus get training runs",
	"GPU allocation",
	"Product direction and releases",
	"Revenue split logic",
];

export default function Economics() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_25%,rgba(0,255,135,0.07),transparent_22%),radial-gradient(circle_at_82%_20%,rgba(0,200,255,0.08),transparent_18%),radial-gradient(circle_at_52%_80%,rgba(255,50,180,0.08),transparent_18%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-12">
				<div className="lg:col-span-5">
					<motion.div
						initial={{ opacity: 0, y: 28 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					>
						<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">the loop</p>
						<h2 className="mt-6 font-orbitron text-[clamp(2.4rem,5vw,5.5rem)] uppercase leading-[0.93] tracking-[-0.05em] text-white">
							fees make your
							<span className="block text-white/32">not a fixed feature set.</span>
						</h2>
						<p className="mt-8 max-w-2xl font-satoshi text-lg leading-8 text-white/66 sm:text-[1.18rem]">
							Users interact. Fees accrue. Fees fund training and inference. Better waifus bring more users. The
							business model feeds the intelligence layer directly.
						</p>
					</motion.div>

					<motion.div
						initial="hidden"
						whileInView="show"
						viewport={{ once: true, amount: 0.15 }}
						variants={{
							hidden: {},
							show: {
								transition: {
									staggerChildren: 0.12,
									delayChildren: 0.1,
								},
							},
						}}
						className="mt-12 grid gap-4"
					>
						{governance.map((item) => (
							<motion.div
								key={item}
								variants={{
									hidden: { opacity: 0, x: -24 },
									show: {
										opacity: 1,
										x: 0,
										transition: { type: "spring" as const, stiffness: 95, damping: 18 },
									},
								}}
								className="flex items-start gap-4 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm"
							>
								<div className="mt-1 h-2.5 w-2.5 rounded-full bg-waifu-green shadow-[0_0_14px_rgba(0,255,135,0.65)]" />
								<div>
									<p
										className="text-[11px] uppercase tracking-[0.3em] text-white/38"
										style={{ fontFamily: "DMMono, monospace" }}
									>
										token holders decide
									</p>
									<p className="mt-2 font-satoshi text-base leading-7 text-white/68">{item}</p>
								</div>
							</motion.div>
						))}
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ delay: 0.12, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-8 rounded-[1.75rem] border border-waifu-green/15 bg-waifu-green/8 p-6 shadow-crt-sm sm:p-7"
					>
						<p
							className="text-[11px] uppercase tracking-[0.28em] text-white/52"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							the cool part
						</p>
						<p className="mt-4 max-w-2xl font-satoshi text-base leading-7 text-white/72 sm:text-lg">
							Agents with wallets can fund their own fine-tuning. Popular waifus earn more resources, get more training,
							and get better. Natural selection for AI personalities.
						</p>
					</motion.div>
				</div>

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
							alt="Circular flow diagram representing the waifu.fun token economy"
							className="relative min-h-[38rem] rounded-[2rem] border border-white/8 bg-waifu-surface lg:min-h-[48rem]"
							imageClassName="object-cover object-center opacity-35"
							fallbackClassName="bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,135,0.12),transparent_18%),radial-gradient(circle_at_50%_50%,rgba(0,200,255,0.09),transparent_32%),linear-gradient(180deg,rgba(17,17,20,1),rgba(8,8,10,1))]"
							sizes="(min-width: 1024px) 48vw, 100vw"
						>
							<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.08),rgba(8,8,10,0.5))]" />
							<div className="absolute inset-0 p-5 sm:p-8">
								<div className="absolute left-6 top-6 rounded-full border border-white/10 bg-black/35 px-4 py-2 backdrop-blur-md sm:left-8 sm:top-8">
									<p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-white/46">the flywheel</p>
								</div>

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
										<div className="absolute inset-[24%] rounded-full border border-waifu-green/15 bg-[radial-gradient(circle,rgba(0,255,135,0.08),transparent_60%)] shadow-[0_0_80px_rgba(0,255,135,0.08)]" />

										{[0, 1, 2, 3, 4, 5].map((particle) => (
											<motion.div
												key={particle}
												animate={{ rotate: 360 }}
												transition={{
													duration: 10 + particle * 2.2,
													repeat: Number.POSITIVE_INFINITY,
													ease: [0.65, 0, 0.35, 1],
													delay: particle * 0.2,
												}}
												className="absolute inset-[10%]"
											>
												<div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-waifu-green shadow-[0_0_18px_rgba(0,255,135,0.9)]" />
											</motion.div>
										))}

										{cycleNodes.map((node, index) => (
											<motion.div
												key={node.short}
												initial={{ opacity: 0, scale: 0.92 }}
												whileInView={{ opacity: 1, scale: 1 }}
												viewport={{ once: true, amount: 0.5 }}
												transition={{ delay: 0.25 + index * 0.1, type: "spring" as const, stiffness: 100, damping: 16 }}
												className={`absolute ${node.position}`}
											>
												<div className="min-w-[9rem] rounded-[1.25rem] border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-xl shadow-[0_12px_28px_rgba(0,0,0,0.32)]">
													<p
														className="text-[10px] uppercase tracking-[0.24em] text-waifu-green"
														style={{ fontFamily: "DMMono, monospace" }}
													>
														{node.short}
													</p>
													<p className="mt-2 font-satoshi text-sm leading-5 text-white/70 sm:text-base">{node.label}</p>
												</div>
											</motion.div>
										))}

										<div className="absolute inset-[31%] flex items-center justify-center rounded-full border border-waifu-green/20 bg-black/55 shadow-crt backdrop-blur-xl">
											<div className="text-center">
												<div className="relative mx-auto h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/5">
													<Image
														src="/brand/icon/icon_1024.png"
														alt="waifu.fun icon"
														fill
														className="object-cover"
														sizes="56px"
													/>
												</div>
												<p className="mt-4 font-orbitron text-sm uppercase tracking-[0.3em] text-waifu-green">
													flywheel
												</p>
												<p className="mt-2 max-w-[12rem] font-satoshi text-sm leading-6 text-white/62 sm:max-w-[15rem] sm:text-base">
													fees become brains.
												</p>
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
