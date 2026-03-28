"use client";

import { motion } from "framer-motion";

const problems = [
	{
		title: "Fees go nowhere",
		copy: "you trade on a launchpad. platform takes 1% on every trade. that money goes to the platform's treasury. it doesn't make your token better, doesn't improve the product, doesn't come back to you.",
	},
	{
		title: "Agents are all the same",
		copy: "the AI agent meta added characters to tokens. but every single one runs on the same model with a different system prompt. your \"unique AI agent\" is literally ChatGPT in a costume. so is everyone else's.",
	},
	{
		title: "Nothing compounds",
		copy: "a token launches hot, trades for a week, dies. the agent never gets better. there's no reason for it to. nothing from the trading activity flows back into improving what the token actually does.",
	},
];

export default function Trenches() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-32 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,50,180,0.08),transparent_20%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-10">
				<motion.div
					initial={{ opacity: 0, y: 40 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.25 }}
					transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
					className="lg:col-span-5 lg:pr-10"
				>
					<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">the problem</p>
					<h2 className="mt-6 max-w-xl font-audiowide text-[clamp(2.4rem,5vw,4.9rem)] uppercase leading-[0.94] tracking-[-0.05em] text-white">
						Launchpads
						<span className="mt-2 block text-white/28">extract. they don't build.</span>
					</h2>
					<p className="mt-8 max-w-lg font-satoshi text-lg leading-8 text-white/68">
						you know how this works. token launches on a bonding curve. people trade. platform takes fees. devs take profit. token dies. next.
					</p>
					<p className="mt-4 max-w-lg font-satoshi text-lg leading-8 text-white/68">
						the AI agent wave added a new spin: now your token has a chatbot. but it's the same chatbot as every other token, running on the same rented model. the "AI" part is a gimmick, not a product.
					</p>
					<div className="mt-10 rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-7 backdrop-blur-sm">
						<p className="text-[11px] uppercase tracking-[0.3em] text-waifu-magenta/80" style={{ fontFamily: "DMMono, monospace" }}>
							current state
						</p>
						<div className="mt-6 flex flex-wrap gap-4 text-sm text-white/50" style={{ fontFamily: "DMMono, monospace" }}>
							<span>fees = extracted</span>
							<span>agents = identical</span>
							<span>improvement = zero</span>
						</div>
					</div>
				</motion.div>

				<motion.div
					initial="hidden"
					whileInView="show"
					viewport={{ once: true, amount: 0.2 }}
					variants={{
						hidden: {},
						show: { transition: { staggerChildren: 0.14 } },
					}}
					className="mt-14 lg:col-span-7 lg:mt-0"
				>
					<div className="grid gap-5">
						{problems.map((problem, index) => (
							<motion.article
								key={problem.title}
								variants={{
									hidden: { opacity: 0, y: 36 },
									show: {
										opacity: 1,
										y: 0,
										transition: { type: "spring" as const, stiffness: 80, damping: 18 },
									},
								}}
								className="group relative overflow-hidden rounded-[2rem] border border-white/8 bg-[#0D0D10]/90 p-1"
							>
								<div className="relative rounded-[1.7rem] border border-white/6 bg-waifu-surface/90 p-6 sm:p-7 lg:grid lg:grid-cols-[80px_1fr] lg:gap-6">
									<div className="flex items-start">
										<div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-white/8 bg-black/30 text-lg text-white/65 shadow-crt-sm">
											<span style={{ fontFamily: "DMMono, monospace" }}>{String(index + 1).padStart(2, "0")}</span>
										</div>
									</div>
									<div>
										<h3 className="mt-4 font-orbitron text-xl uppercase tracking-[-0.04em] text-white transition-colors duration-500 group-hover:text-waifu-green sm:text-2xl lg:mt-0">
											{problem.title}
										</h3>
										<p className="mt-4 max-w-2xl font-satoshi text-base leading-7 text-white/62 sm:text-lg">
											{problem.copy}
										</p>
									</div>
								</div>
							</motion.article>
						))}
					</div>
				</motion.div>
			</div>
		</section>
	);
}
