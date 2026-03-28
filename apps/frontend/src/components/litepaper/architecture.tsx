"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const archLayers = [
	{
		id: "01",
		label: "waifu.fun",
		sublabel: "Consumer Layer",
		detail: "Fine-tuned companions",
		color: "rgba(0,255,135,0.22)",
		borderColor: "border-waifu-green/30",
		textColor: "text-waifu-green",
		width: "w-full",
	},
	{
		id: "02",
		label: "Milady Cloud",
		sublabel: "Orchestration",
		detail: "Runtimes \u00b7 Routing \u00b7 Scaling",
		color: "rgba(255,50,180,0.16)",
		borderColor: "border-waifu-magenta/25",
		textColor: "text-waifu-magenta",
		width: "w-[92%]",
	},
	{
		id: "03",
		label: "Character + Steward",
		sublabel: "Intelligence + Custody",
		detail: "Assistant Layer \u00b7 EVM + Solana Wallets",
		color: "rgba(0,200,255,0.16)",
		borderColor: "border-waifu-cyan/25",
		textColor: "text-waifu-cyan",
		width: "w-[84%]",
		split: true,
		splitLeft: { label: "Milady Character", sub: "The Nervous System" },
		splitRight: { label: "Steward", sub: "Wallet / Custody" },
	},
	{
		id: "04",
		label: "Compute",
		sublabel: "Infrastructure",
		detail: "Vast \u00b7 RunPod \u00b7 A100 \u00b7 H100 \u00b7 On demand",
		color: "rgba(255,255,255,0.1)",
		borderColor: "border-white/15",
		textColor: "text-white/70",
		width: "w-[76%]",
	},
	{
		id: "05",
		label: "Token Economy",
		sublabel: "Governance",
		detail: "Fees \u00b7 Training \u00b7 Allocation",
		color: "rgba(0,255,135,0.14)",
		borderColor: "border-waifu-green/20",
		textColor: "text-waifu-green/80",
		width: "w-[68%]",
	},
];

function ConnectionLine({ delay }: { delay: number }) {
	return (
		<motion.div
			initial={{ scaleY: 0, opacity: 0 }}
			whileInView={{ scaleY: 1, opacity: 1 }}
			viewport={{ once: true }}
			transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
			className="mx-auto h-8 w-px origin-top bg-gradient-to-b from-waifu-green/50 via-white/15 to-transparent"
		/>
	);
}

export default function Architecture() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,255,135,0.06),transparent_24%),radial-gradient(circle_at_50%_80%,rgba(255,50,180,0.06),transparent_20%)]" />
			<div className="relative mx-auto max-w-[1600px]">
				<motion.div
					initial={{ opacity: 0, y: 28 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.3 }}
					transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					className="text-center"
				>
					<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">
						Section 7 / Architecture
					</p>
					<h2 className="mx-auto mt-6 max-w-4xl font-orbitron text-[clamp(2.4rem,5vw,5.5rem)] uppercase leading-[0.93] tracking-[-0.05em] text-white">
						The full vertical.
					</h2>
					<p className="mx-auto mt-8 max-w-2xl font-satoshi text-lg leading-8 text-white/66">
						From personality weights at the top to token governance at the base. Each layer has a job. The stack
						works because they all connect.
					</p>
				</motion.div>

				<div className="mx-auto mt-20 flex max-w-4xl flex-col items-center">
					{archLayers.map((layer, index) => (
						<div key={layer.id} className={`flex flex-col items-center ${layer.width}`}>
							{index > 0 && <ConnectionLine delay={0.2 + index * 0.12} />}
							<motion.div
								initial={{ opacity: 0, y: 28, scale: 0.96 }}
								whileInView={{ opacity: 1, y: 0, scale: 1 }}
								viewport={{ once: true, amount: 0.4 }}
								transition={{
									delay: 0.15 + index * 0.12,
									type: "spring" as const,
									stiffness: 90,
									damping: 18,
								}}
								className="w-full"
							>
								<div
									className={`group relative overflow-hidden rounded-[1.8rem] border ${layer.borderColor} bg-[#0D0D10]/90 p-1 transition-all duration-500 hover:shadow-[0_0_40px_${layer.color}]`}
								>
									<div
										className="absolute inset-0 opacity-40"
										style={{
											background: `radial-gradient(circle at 50% 50%, ${layer.color}, transparent 60%)`,
										}}
									/>
									<div className="relative rounded-[1.5rem] border border-white/6 bg-waifu-surface/80 backdrop-blur-sm">
										{layer.split ? (
											<div className="grid gap-px sm:grid-cols-2">
												<div className="p-5 sm:p-6">
													<div className="flex items-center gap-3">
														<p
															className={`text-[11px] uppercase tracking-[0.28em] ${layer.textColor}`}
															style={{ fontFamily: "DMMono, monospace" }}
														>
															{layer.id}a
														</p>
														<div className="h-px flex-1 bg-white/8" />
													</div>
													<p className="mt-3 font-orbitron text-lg uppercase tracking-[-0.02em] text-white sm:text-xl">
														{layer.splitLeft?.label}
													</p>
													<p className="mt-2 font-satoshi text-sm leading-6 text-white/55">
														{layer.splitLeft?.sub}
													</p>
												</div>
												<div className="border-t border-white/6 p-5 sm:border-l sm:border-t-0 sm:p-6">
													<div className="flex items-center gap-3">
														<p
															className={`text-[11px] uppercase tracking-[0.28em] ${layer.textColor}`}
															style={{ fontFamily: "DMMono, monospace" }}
														>
															{layer.id}b
														</p>
														<div className="h-px flex-1 bg-white/8" />
													</div>
													<p className="mt-3 font-orbitron text-lg uppercase tracking-[-0.02em] text-white sm:text-xl">
														{layer.splitRight?.label}
													</p>
													<p className="mt-2 font-satoshi text-sm leading-6 text-white/55">
														{layer.splitRight?.sub}
													</p>
												</div>
											</div>
										) : (
											<div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
												<div>
													<div className="flex items-center gap-3">
														<p
															className={`text-[11px] uppercase tracking-[0.28em] ${layer.textColor}`}
															style={{ fontFamily: "DMMono, monospace" }}
														>
															{layer.id}
														</p>
														<p className="font-orbitron text-[10px] uppercase tracking-[0.3em] text-white/38">
															{layer.sublabel}
														</p>
													</div>
													<p className="mt-3 font-orbitron text-xl uppercase tracking-[-0.02em] text-white sm:text-2xl">
														{layer.label}
													</p>
												</div>
												<div className="rounded-full border border-white/10 bg-black/25 px-4 py-2">
													<p
														className="text-[11px] uppercase tracking-[0.24em] text-white/50"
														style={{ fontFamily: "DMMono, monospace" }}
													>
														{layer.detail}
													</p>
												</div>
											</div>
										)}
									</div>
								</div>
							</motion.div>
						</div>
					))}

					<motion.div
						initial={{ opacity: 0, scaleX: 0 }}
						whileInView={{ opacity: 1, scaleX: 1 }}
						viewport={{ once: true }}
						transition={{ delay: 0.9, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-10 h-px w-full origin-center bg-gradient-to-r from-transparent via-waifu-green/40 to-transparent"
					/>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 1.0, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
						className="mt-8 flex items-center gap-4"
					>
						<div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-white/5">
							<Image
								src="/brand/icon/icon_1024.png"
								alt="waifu.fun"
								fill
								className="object-cover"
								sizes="32px"
							/>
						</div>
						<p
							className="text-[11px] uppercase tracking-[0.3em] text-white/45"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							soul to payments in one stack
						</p>
					</motion.div>
				</div>
			</div>
		</section>
	);
}
