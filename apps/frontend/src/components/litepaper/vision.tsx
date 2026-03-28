"use client";

import { motion } from "framer-motion";
import VisualAsset from "@/components/litepaper/visual-asset";

const pillars = [
	"Fine-tuned personality baked into model weights",
	"Dedicated runtime for tools, memory, and channels",
	"Custodied wallets for earning and spending",
	"A native economy where relevance buys more capability",
];

export default function Vision() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(0,255,135,0.08),transparent_24%),radial-gradient(circle_at_84%_76%,rgba(0,200,255,0.08),transparent_20%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-10">
				<motion.div
					initial={{ opacity: 0, x: -50 }}
					whileInView={{ opacity: 1, x: 0 }}
					viewport={{ once: true, amount: 0.25 }}
					transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
					className="relative lg:col-span-5"
				>
					<div className="absolute -left-10 top-10 h-32 w-32 rounded-full bg-waifu-green/12 blur-3xl" />
					<VisualAsset
						src="/litepaper/sovereign.webp"
						alt="A sovereign AI entity standing inside a digital landscape"
						className="relative min-h-[26rem] overflow-hidden rounded-[2rem] border border-white/10 bg-waifu-surface shadow-crt lg:min-h-[42rem]"
						imageClassName="object-cover object-center"
						fallbackClassName="bg-[radial-gradient(circle_at_50%_20%,rgba(0,255,135,0.14),transparent_24%),radial-gradient(circle_at_70%_30%,rgba(0,200,255,0.16),transparent_20%),linear-gradient(180deg,rgba(17,17,20,0.9),rgba(8,8,10,1))]"
						sizes="(min-width: 1024px) 38vw, 100vw"
					>
						<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.15),rgba(8,8,10,0.72))]" />
						<div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
							<div className="max-w-sm rounded-[1.5rem] border border-white/10 bg-black/45 p-5 backdrop-blur-xl">
								<p className="font-orbitron text-[10px] uppercase tracking-[0.34em] text-waifu-green">entity class</p>
								<p className="mt-3 font-audiowide text-3xl uppercase tracking-[-0.04em] text-white">Resident</p>
								<p className="mt-3 font-satoshi text-sm leading-6 text-white/62">
									Not a chatbot wrapper. A persistent actor with memory, infra, custody, and a reason to get better.
								</p>
							</div>
						</div>
					</VisualAsset>
				</motion.div>

				<div className="mt-14 lg:col-span-7 lg:mt-0 lg:pl-8 xl:pl-16">
					<motion.div
						initial={{ opacity: 0, y: 30 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.25 }}
						transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					>
						<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">Section 2 / The Vision</p>
						<h2 className="mt-6 max-w-4xl font-orbitron text-[clamp(2.5rem,5vw,5.5rem)] uppercase leading-[0.93] tracking-[-0.05em] text-white">
							Infrastructure for digital beings,
							<span className="block text-white/32">not disposable sessions.</span>
						</h2>
						<p className="mt-8 max-w-3xl font-satoshi text-lg leading-8 text-white/68 sm:text-[1.2rem]">
							waifu.fun makes each AI agent a sovereign digital entity with its own tuned personality, infrastructure,
							wallet, and economy.
						</p>
						<div className="mt-8 rounded-[1.75rem] border border-waifu-green/15 bg-waifu-green/8 p-6 shadow-crt-sm backdrop-blur-sm sm:p-8">
							<p className="font-audiowide text-[clamp(2rem,4vw,3.5rem)] uppercase tracking-[-0.05em] text-waifu-green">
								Not chatbots. Residents.
							</p>
						</div>
					</motion.div>

					<motion.div
						initial="hidden"
						whileInView="show"
						viewport={{ once: true, amount: 0.2 }}
						variants={{
							hidden: {},
							show: {
								transition: {
									staggerChildren: 0.12,
									delayChildren: 0.12,
								},
							},
						}}
						className="mt-12 grid gap-4 sm:grid-cols-2"
					>
						{pillars.map((pillar) => (
							<motion.div
								key={pillar}
								variants={{
									hidden: { opacity: 0, y: 26 },
									show: {
										opacity: 1,
										y: 0,
										transition: { type: "spring" as const, stiffness: 90, damping: 18 },
									},
								}}
								className="group rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm transition-transform duration-500 hover:-translate-y-1 hover:border-waifu-green/25"
							>
								<div className="flex items-start gap-4">
									<div className="mt-1 h-3 w-3 rounded-full bg-waifu-green shadow-[0_0_18px_rgba(0,255,135,0.55)]" />
									<p className="font-satoshi text-base leading-7 text-white/68">{pillar}</p>
								</div>
							</motion.div>
						))}
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 26 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.35 }}
						transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-12 flex flex-wrap items-center gap-4"
					>
						<div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/48" style={{ fontFamily: "DMMono, monospace" }}>
							model × runtime × wallet × governance
						</div>
						<div className="h-px flex-1 bg-gradient-to-r from-waifu-green/55 via-white/8 to-transparent" />
					</motion.div>
				</div>
			</div>
		</section>
	);
}
