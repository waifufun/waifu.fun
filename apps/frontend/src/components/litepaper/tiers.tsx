"use client";

import { motion } from "framer-motion";

const tiers = [
	{
		name: "Free",
		tag: "start here",
		description: "base model with a system prompt. works like every other platform. good enough to launch and see if people like your character.",
		model: "shared model + prompt",
		infra: "shared API",
		highlight: false,
	},
	{
		name: "Pro",
		tag: "fine-tuned",
		description: "your waifu gets its own fine-tuned model. personality is in the weights, not a prompt. this is where it stops being a chatbot and starts being a character.",
		model: "fine-tuned open-weight",
		infra: "shared GPU pool",
		highlight: false,
	},
	{
		name: "Ultra",
		tag: "dedicated",
		description: "fine-tuned on a frontier model with its own GPU. faster responses, smarter conversations, more capable across the board.",
		model: "fine-tuned frontier",
		infra: "dedicated GPU",
		highlight: false,
	},
	{
		name: "Sovereign",
		tag: "fully custom",
		description: "custom training runs on your own hardware. token-gated access. this waifu is a different species.",
		model: "custom training runs",
		infra: "own hardware",
		highlight: true,
	},
];

export default function Tiers() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-32 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(0,255,135,0.06),transparent_22%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-10">
				<motion.div
					initial={{ opacity: 0, y: 28 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.3 }}
					transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					className="lg:col-span-4"
				>
					<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">tiers</p>
					<h2 className="mt-6 font-orbitron text-[clamp(2.4rem,4.6vw,5rem)] uppercase leading-[0.93] tracking-[-0.05em] text-white">
						pick your level.
					</h2>
					<p className="mt-8 max-w-xl font-satoshi text-lg leading-8 text-white/66">
						start free. upgrade as your token grows. each tier gives your waifu a better brain and better hardware.
					</p>
					<div className="mt-10 rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm">
						<p className="text-[11px] uppercase tracking-[0.28em] text-white/42" style={{ fontFamily: "DMMono, monospace" }}>
							how it scales
						</p>
						<p className="mt-4 font-satoshi text-base leading-7 text-white/66">
							system prompt &rarr; fine-tuned &rarr; dedicated GPU &rarr; fully custom
						</p>
					</div>
				</motion.div>

				<div className="mt-14 lg:col-span-8 lg:mt-0">
					<div className="grid gap-5">
						{tiers.map((tier, index) => (
							<motion.article
								key={tier.name}
								initial={{ opacity: 0, x: 36, y: 24 }}
								whileInView={{ opacity: 1, x: 0, y: 0 }}
								viewport={{ once: true, amount: 0.25 }}
								transition={{ delay: index * 0.08, type: "spring" as const, stiffness: 95, damping: 18 }}
								className={`relative overflow-hidden rounded-[2rem] border p-1 ${
									tier.highlight
										? "border-waifu-green/30 bg-waifu-green/10 shadow-crt"
										: "border-white/8 bg-white/[0.03]"
								}`}
							>
								<div
									className={`relative rounded-[1.7rem] border p-6 backdrop-blur-sm sm:p-7 ${
										tier.highlight ? "border-waifu-green/20 bg-black/50" : "border-white/6 bg-black/28"
									}`}
								>
									<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
										<div className="max-w-3xl">
											<div className="flex flex-wrap items-center gap-3">
												<p className="font-orbitron text-[11px] uppercase tracking-[0.35em] text-waifu-green">{tier.tag}</p>
												<p className="text-[11px] uppercase tracking-[0.26em] text-white/38" style={{ fontFamily: "DMMono, monospace" }}>
													{String(index + 1).padStart(2, "0")}
												</p>
											</div>
											<h3 className={`mt-4 font-orbitron text-[1.8rem] uppercase tracking-[-0.04em] sm:text-[2.4rem] ${tier.highlight ? "text-waifu-green" : "text-white"}`}>
												{tier.name}
											</h3>
											<p className="mt-4 font-satoshi text-base leading-7 text-white/66 sm:text-lg">{tier.description}</p>
										</div>
										<div className="grid shrink-0 gap-3 rounded-[1.5rem] border border-white/10 bg-black/30 p-4 text-sm text-white/60 lg:min-w-[16rem]">
											<div>
												<p className="text-[10px] uppercase tracking-[0.24em] text-white/38" style={{ fontFamily: "DMMono, monospace" }}>
													model
												</p>
												<p className="mt-2 font-satoshi text-sm leading-6 text-white/72">{tier.model}</p>
											</div>
											<div className="h-px bg-white/8" />
											<div>
												<p className="text-[10px] uppercase tracking-[0.24em] text-white/38" style={{ fontFamily: "DMMono, monospace" }}>
													hardware
												</p>
												<p className="mt-2 font-satoshi text-sm leading-6 text-white/72">{tier.infra}</p>
											</div>
										</div>
									</div>
								</div>
							</motion.article>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
