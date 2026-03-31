"use client";

import { motion } from "framer-motion";
import VisualAsset from "@/components/litepaper/visual-asset";

export default function Different() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(0,255,135,0.08),transparent_24%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-10">
				<motion.div
					initial={{ opacity: 0, x: -50 }}
					whileInView={{ opacity: 1, x: 0 }}
					viewport={{ once: true, amount: 0.25 }}
					transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
					className="relative lg:col-span-5"
				>
					<VisualAsset
						src="/litepaper/sovereign.webp"
						alt="Fine-tuned AI agent"
						className="relative min-h-[26rem] overflow-hidden rounded-[2rem] border border-white/10 bg-waifu-surface shadow-crt lg:min-h-[42rem]"
						imageClassName="object-cover object-center"
						fallbackClassName="bg-[radial-gradient(circle_at_50%_20%,rgba(0,255,135,0.14),transparent_24%)]"
						sizes="(min-width: 1024px) 38vw, 100vw"
					>
						<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.15),rgba(8,8,10,0.72))]" />
						<div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
							<div className="max-w-sm rounded-[1.5rem] border border-white/10 bg-black/45 p-5 backdrop-blur-xl">
								<p className="font-orbitron text-[10px] uppercase tracking-[0.34em] text-waifu-green">fine-tuning</p>
								<p className="mt-3 font-satoshi text-sm leading-6 text-white/62">
									take a base model. train it on your character's personality, knowledge, and style. now it doesn't need instructions. it just IS that character.
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
						<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">what's different</p>
						<h2 className="mt-6 max-w-4xl font-orbitron text-[clamp(2.5rem,5vw,5.5rem)] uppercase leading-[0.93] tracking-[-0.05em] text-white">
							fees fund
							<span className="block text-waifu-green [text-shadow:0_0_26px_rgba(0,255,135,0.2)]">fine-tuning.</span>
						</h2>
						<p className="mt-8 max-w-3xl font-satoshi text-lg leading-8 text-white/68 sm:text-[1.2rem]">
							on waifu.fun, trading fees don't just disappear into a treasury. they pay for training runs that make your agent's model better.
						</p>
						<p className="mt-4 max-w-3xl font-satoshi text-lg leading-8 text-white/68 sm:text-[1.2rem]">
							here's the difference: a system prompt tells a model "you are a cat girl named luna." fine-tuning actually rewires the model so it thinks like luna, talks like luna, remembers like luna. the personality isn't a mask. it's baked in.
						</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-10 rounded-[1.75rem] border border-waifu-green/15 bg-waifu-green/8 p-6 shadow-crt-sm backdrop-blur-sm sm:p-8"
					>
						<p className="font-audiowide text-[clamp(1.6rem,3.5vw,2.8rem)] uppercase tracking-[-0.05em] text-waifu-green">
							not prompted. trained.
						</p>
						<p className="mt-4 font-satoshi text-base leading-7 text-white/62">
							a system prompt reads the character sheet every conversation and forgets between sessions. a fine-tuned model doesn't need the character sheet. it already knows who it is.
						</p>
					</motion.div>

					<motion.div
						initial="hidden"
						whileInView="show"
						viewport={{ once: true, amount: 0.2 }}
						variants={{
							hidden: {},
							show: { transition: { staggerChildren: 0.12, delayChildren: 0.12 } },
						}}
						className="mt-10 grid gap-4 sm:grid-cols-2"
					>
						{[
							"every other platform: same model, different costume",
							"waifu.fun: different model for each character",
							"training data: conversations, personality, style, lore",
							"result: your waifu is the only one like it",
						].map((point) => (
							<motion.div
								key={point}
								variants={{
									hidden: { opacity: 0, y: 26 },
									show: {
										opacity: 1,
										y: 0,
										transition: { type: "spring" as const, stiffness: 90, damping: 18 },
									},
								}}
								className="group rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm"
							>
								<div className="flex items-start gap-4">
									<div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-waifu-green shadow-[0_0_18px_rgba(0,255,135,0.55)]" />
									<p className="font-satoshi text-base leading-7 text-white/68">{point}</p>
								</div>
							</motion.div>
						))}
					</motion.div>
				</div>
			</div>
		</section>
	);
}
