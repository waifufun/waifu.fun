"use client";

import { motion } from "framer-motion";
import VisualAsset from "@/components/litepaper/visual-asset";

const layers = [
	{
		id: "01",
		title: "Fine-Tuned Personalities",
		nickname: "the brain",
		copy: "a model fine-tuned on your character. not a system prompt. the personality IS the model.",
		tint: "rgba(0,255,135,0.18)",
		y: "8%",
		x: "12%",
		width: "70%",
	},
	{
		id: "02",
		title: "Milady Cloud",
		nickname: "the body",
		copy: "where your waifu runs. model endpoint, tools, memory, chat channels. all configurable.",
		tint: "rgba(255,50,180,0.16)",
		y: "26%",
		x: "8%",
		width: "76%",
	},
	{
		id: "03",
		title: "The Assistant Layer",
		nickname: "the helper",
		copy: "a background assistant that handles the boring stuff: tool calls, wallet ops, scheduling. your waifu focuses on being itself.",
		tint: "rgba(0,200,255,0.16)",
		y: "44%",
		x: "14%",
		width: "68%",
	},
	{
		id: "04",
		title: "Steward",
		nickname: "the wallet",
		copy: "real crypto wallet. EVM + Solana. your waifu can hold tokens, earn fees, and spend autonomously.",
		tint: "rgba(0,255,135,0.14)",
		y: "62%",
		x: "9%",
		width: "74%",
	},
	{
		id: "05",
		title: "Elastic Compute",
		nickname: "the hardware",
		copy: "actual GPUs running your model. A100s, H100s. scales up when busy, scales down when quiet.",
		tint: "rgba(255,255,255,0.12)",
		y: "80%",
		x: "15%",
		width: "66%",
	},
];

export default function Stack() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,rgba(0,255,135,0.08),transparent_22%),radial-gradient(circle_at_80%_70%,rgba(255,50,180,0.08),transparent_18%)]" />
			<div className="relative mx-auto max-w-[1600px]">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.25 }}
					transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
					className="max-w-5xl"
				>
					<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">how it works</p>
					<h2 className="mt-6 font-orbitron text-[clamp(2.5rem,5vw,5.8rem)] uppercase leading-[0.92] tracking-[-0.05em] text-white">
						what's under
						<span className="block text-white/32">the hood.</span>
					</h2>
					<p className="mt-8 max-w-3xl font-satoshi text-lg leading-8 text-white/66 sm:text-[1.18rem]">
						The moat isn't one model. It's the stack that makes each agent real: model identity, runtime, tool
						execution, custody, and elastic compute in one sovereign system.
					</p>
				</motion.div>

				<div className="mt-16 grid gap-10 lg:grid-cols-12 lg:items-start">
					<div className="lg:col-span-5 lg:sticky lg:top-10">
						<div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-black/40 p-3 shadow-crt">
							<VisualAsset
								src="/litepaper/stack.webp"
								alt="Floating infrastructure layers forming the waifu.fun agent stack"
								className="relative min-h-[36rem] rounded-[1.8rem] border border-white/8 bg-waifu-surface lg:min-h-[44rem]"
								imageClassName="object-cover object-center opacity-70"
								fallbackClassName="bg-[radial-gradient(circle_at_50%_10%,rgba(0,255,135,0.18),transparent_20%),radial-gradient(circle_at_50%_70%,rgba(0,200,255,0.12),transparent_24%),linear-gradient(180deg,rgba(17,17,20,1),rgba(8,8,10,1))]"
								sizes="(min-width: 1024px) 36vw, 100vw"
							>
								<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.15),rgba(8,8,10,0.68))]" />
								<div className="absolute inset-x-5 top-5 flex items-center justify-between rounded-full border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
									<p className="font-orbitron text-[10px] uppercase tracking-[0.32em] text-white/48">the stack</p>
									<p
										className="text-[11px] uppercase tracking-[0.26em] text-waifu-green"
										style={{ fontFamily: "DMMono, monospace" }}
									>
										5 layers
									</p>
								</div>
								<div className="absolute inset-0">
									{layers.map((layer, index) => (
										<motion.div
											key={layer.id}
											initial={{ opacity: 0, y: 32, scale: 0.94 }}
											whileInView={{ opacity: 1, y: 0, scale: 1 }}
											viewport={{ once: true, amount: 0.5 }}
											transition={{ delay: index * 0.12, type: "spring" as const, stiffness: 90, damping: 16 }}
											style={{ top: layer.y, left: layer.x, width: layer.width }}
											className="absolute"
										>
											<div className="rounded-[1.4rem] border border-white/10 bg-black/35 p-4 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
												<div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
												<div
													className="absolute inset-y-0 left-0 w-full rounded-[1.4rem]"
													style={{ boxShadow: `0 0 40px ${layer.tint}` }}
												/>
												<div className="relative flex items-center justify-between gap-4">
													<div>
														<p className="font-orbitron text-[10px] uppercase tracking-[0.32em] text-white/40">
															{layer.nickname}
														</p>
														<p className="mt-2 font-orbitron text-sm uppercase tracking-[0.02em] text-white sm:text-base">
															{layer.title}
														</p>
													</div>
													<p className="text-sm text-waifu-green" style={{ fontFamily: "DMMono, monospace" }}>
														{layer.id}
													</p>
												</div>
											</div>
										</motion.div>
									))}
								</div>
							</VisualAsset>
						</div>
					</div>

					<motion.div
						initial="hidden"
						whileInView="show"
						viewport={{ once: true, amount: 0.1 }}
						variants={{
							hidden: {},
							show: {
								transition: {
									staggerChildren: 0.14,
								},
							},
						}}
						className="lg:col-span-7 lg:pl-6"
					>
						<div className="grid gap-5">
							{layers.map((layer, index) => (
								<motion.article
									key={layer.id}
									variants={{
										hidden: { opacity: 0, x: 40 },
										show: {
											opacity: 1,
											x: 0,
											transition: { type: "spring" as const, stiffness: 85, damping: 18 },
										},
									}}
									className={`relative overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-7 ${
										index % 2 === 0 ? "lg:mr-16" : "lg:ml-16"
									}`}
								>
									<div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_35%,transparent_70%,rgba(0,255,135,0.06)_100%)]" />
									<div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
										<div className="sm:max-w-3xl">
											<div className="flex flex-wrap items-center gap-3">
												<p className="font-orbitron text-[11px] uppercase tracking-[0.35em] text-waifu-green">
													{layer.nickname}
												</p>
												<div className="h-px w-10 bg-white/10" />
												<p
													className="text-[11px] uppercase tracking-[0.28em] text-white/40"
													style={{ fontFamily: "DMMono, monospace" }}
												>
													layer {layer.id}
												</p>
											</div>
											<h3 className="mt-4 font-orbitron text-[1.7rem] uppercase tracking-[-0.04em] text-white sm:text-[2.2rem]">
												{layer.title}
											</h3>
											<p className="mt-4 font-satoshi text-base leading-7 text-white/64 sm:text-lg">{layer.copy}</p>
										</div>
										<div
											className="flex shrink-0 items-center gap-3 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/55"
											style={{ fontFamily: "DMMono, monospace" }}
										>
											<span>{layer.id}</span>
											<span className="h-1.5 w-1.5 rounded-full bg-waifu-green shadow-[0_0_12px_rgba(0,255,135,0.65)]" />
											<span>online</span>
										</div>
									</div>
								</motion.article>
							))}
						</div>
					</motion.div>
				</div>
			</div>
		</section>
	);
}
