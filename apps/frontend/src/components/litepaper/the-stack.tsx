"use client";

import { motion } from "framer-motion";
import VisualAsset from "@/components/litepaper/visual-asset";

const layers = [
	{
		id: "01",
		title: "ElizaOS",
		nickname: "the framework",
		copy: "open-source agent framework. built by hundreds of contributors. handles personality, memory, tool use, and multi-platform chat. the brain that runs every waifu.",
		link: "github.com/elizaos",
	},
	{
		id: "02",
		title: "Milady Cloud",
		nickname: "the hosting",
		copy: "each waifu gets its own container, its own runtime config, its own model endpoint. not a shared chatbot API. dedicated infrastructure per agent.",
	},
	{
		id: "03",
		title: "Steward",
		nickname: "the wallet",
		copy: "real crypto wallets for every agent. EVM and Solana. your waifu can receive fees, hold tokens, and spend autonomously. not a fake balance in a database.",
	},
	{
		id: "04",
		title: "Fine-Tuning Pipeline",
		nickname: "the training",
		copy: "conversation data, personality docs, and style examples go in. a custom model comes out. runs on open-weight bases so there are no vendor locks and no content filters you didn't choose.",
	},
	{
		id: "05",
		title: "GPU Compute",
		nickname: "the hardware",
		copy: "A100s and H100s on demand. fine-tuned models need real GPUs to run inference. scales up when your waifu is popular, scales down when it's quiet. you don't pay for idle hardware.",
	},
];

export default function TheStack() {
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
					<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">the stack</p>
					<h2 className="mt-6 font-orbitron text-[clamp(2.5rem,5vw,5.8rem)] uppercase leading-[0.92] tracking-[-0.05em] text-white">
						what's under
						<span className="block text-white/32">the hood.</span>
					</h2>
					<p className="mt-8 max-w-3xl font-satoshi text-lg leading-8 text-white/66 sm:text-[1.18rem]">
						waifu.fun isn't a wrapper on someone else's API. it's a full stack built on open-source infrastructure that the community owns.
					</p>
				</motion.div>

				<div className="mt-16 grid gap-10 lg:grid-cols-12 lg:items-start">
					{/* Image sidebar */}
					<div className="lg:col-span-5 lg:sticky lg:top-10">
						<VisualAsset
							src="/litepaper/stack.webp"
							alt="The waifu.fun infrastructure stack"
							className="relative min-h-[36rem] overflow-hidden rounded-[2rem] border border-white/10 bg-waifu-surface shadow-crt lg:min-h-[44rem]"
							imageClassName="object-cover object-center opacity-70"
							fallbackClassName="bg-[radial-gradient(circle_at_50%_10%,rgba(0,255,135,0.18),transparent_20%)]"
							sizes="(min-width: 1024px) 36vw, 100vw"
						>
							<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,10,0.15),rgba(8,8,10,0.68))]" />
							<div className="absolute inset-x-5 top-5 flex items-center justify-between rounded-full border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
								<p className="font-orbitron text-[10px] uppercase tracking-[0.32em] text-white/48">open source</p>
								<p className="text-[11px] uppercase tracking-[0.26em] text-waifu-green" style={{ fontFamily: "DMMono, monospace" }}>
									5 layers
								</p>
							</div>
						</VisualAsset>
					</div>

					{/* Layer cards */}
					<motion.div
						initial="hidden"
						whileInView="show"
						viewport={{ once: true, amount: 0.1 }}
						variants={{
							hidden: {},
							show: { transition: { staggerChildren: 0.14 } },
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
										index % 2 === 0 ? "lg:mr-12" : "lg:ml-12"
									}`}
								>
									<div className="relative">
										<div className="flex flex-wrap items-center gap-3">
											<p className="font-orbitron text-[11px] uppercase tracking-[0.35em] text-waifu-green">{layer.nickname}</p>
											<div className="h-px w-10 bg-white/10" />
											<p className="text-[11px] uppercase tracking-[0.28em] text-white/40" style={{ fontFamily: "DMMono, monospace" }}>
												{layer.id}
											</p>
										</div>
										<h3 className="mt-4 font-orbitron text-[1.7rem] uppercase tracking-[-0.04em] text-white sm:text-[2.2rem]">
											{layer.title}
										</h3>
										<p className="mt-4 font-satoshi text-base leading-7 text-white/64 sm:text-lg">{layer.copy}</p>
										{layer.link && (
											<p className="mt-4 text-[11px] uppercase tracking-[0.26em] text-waifu-green/70" style={{ fontFamily: "DMMono, monospace" }}>
												{layer.link}
											</p>
										)}
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
