"use client";

import { motion } from "framer-motion";

const failureModes = [
	{
		title: "Stateless by design",
		copy: "Character continuity resets into a fresh API call. Nothing compounds. Nothing persists. There is no self to deepen over time.",
	},
	{
		title: "Owned by the model vendor",
		copy: "App layer gets the looks. Model vendors get the money and power.",
	},
	{
		title: "Differentiation collapses",
		copy: "When the core intelligence is rented and identical, differentiation shrinks to prompt tricks, voice wrappers, and costume changes.",
	},
];

const container = {
	hidden: {},
	show: {
		transition: {
			staggerChildren: 0.14,
		},
	},
};

const item = {
	hidden: { opacity: 0, y: 36 },
	show: {
		opacity: 1,
		y: 0,
		transition: { type: "spring" as const, stiffness: 80, damping: 18, mass: 0.9 },
	},
};

export default function Problem() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-32 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,50,180,0.08),transparent_20%),radial-gradient(circle_at_20%_80%,rgba(0,255,135,0.06),transparent_24%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-10">
				<motion.div
					initial={{ opacity: 0, y: 40 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, amount: 0.25 }}
					transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
					className="lg:col-span-5 lg:pr-10"
				>
					<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">Section 1 / The Problem</p>
					<h2 className="mt-6 max-w-xl font-audiowide text-[clamp(2.4rem,5vw,4.9rem)] uppercase leading-[0.94] tracking-[-0.05em] text-white">
						Same brain.
						<span className="mt-2 block text-white/28">Different costume.</span>
					</h2>
					<p className="mt-8 max-w-lg font-satoshi text-lg leading-8 text-white/68">
						Most companion AI platforms are the same thing: a system prompt on top of Claude or GPT. You talk to a
						character, but underneath it's a stateless API call in costume.
					</p>
					<div className="mt-10 rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-7 backdrop-blur-sm">
						<p className="text-[11px] uppercase tracking-[0.3em] text-waifu-magenta/80" style={{ fontFamily: "DMMono, monospace" }}>
							market structure
						</p>
						<p className="mt-4 max-w-md font-satoshi text-base leading-7 text-white/62">
							So it becomes a race to the bottom on personality prompts, while OpenAI and Anthropic keep the value,
							the infra, and the compounding intelligence layer.
						</p>
						<div className="mt-7 h-px w-full bg-gradient-to-r from-waifu-magenta/0 via-waifu-magenta/50 to-waifu-magenta/0" />
						<div className="mt-6 flex flex-wrap gap-4 text-sm text-white/50" style={{ fontFamily: "DMMono, monospace" }}>
							<span>memory = 0</span>
							<span>ownership = 0</span>
							<span>differentiation = decaying</span>
						</div>
					</div>
				</motion.div>

				<motion.div
					variants={container}
					initial="hidden"
					whileInView="show"
					viewport={{ once: true, amount: 0.2 }}
					className="mt-14 lg:col-span-7 lg:mt-0"
				>
					<div className="grid gap-5 lg:ml-auto lg:max-w-[52rem]">
						{failureModes.map((mode, index) => (
							<motion.article
								key={mode.title}
								variants={item}
								className="group relative overflow-hidden rounded-[2rem] border border-white/8 bg-[#0D0D10]/90 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.24)]"
							>
								<div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05),transparent_30%,transparent_70%,rgba(0,255,135,0.08))] opacity-70 transition-opacity duration-500 group-hover:opacity-100" />
								<div className="relative rounded-[1.7rem] border border-white/6 bg-waifu-surface/90 p-6 sm:p-7 lg:grid lg:grid-cols-[92px_1fr] lg:gap-6">
									<div className="flex items-start justify-between lg:block">
										<div className="inline-flex h-16 w-16 items-center justify-center rounded-[1.25rem] border border-white/8 bg-black/30 text-xl text-white/65 shadow-crt-sm">
											<span style={{ fontFamily: "DMMono, monospace" }}>{String(index + 1).padStart(2, "0")}</span>
										</div>
										<div className="mt-0 lg:mt-6">
											<div className="h-20 w-px bg-gradient-to-b from-waifu-green/50 via-waifu-green/15 to-transparent" />
										</div>
									</div>
									<div>
										<p className="font-orbitron text-[11px] uppercase tracking-[0.34em] text-white/40">failure mode</p>
										<h3 className="mt-4 font-orbitron text-2xl uppercase tracking-[-0.04em] text-white transition-colors duration-500 group-hover:text-waifu-green sm:text-[2rem]">
											{mode.title}
										</h3>
										<p className="mt-4 max-w-2xl font-satoshi text-base leading-7 text-white/62 sm:text-lg">
											{mode.copy}
										</p>
										<div className="mt-6 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.26em] text-white/38" style={{ fontFamily: "DMMono, monospace" }}>
											<span className="rounded-full border border-white/10 px-3 py-1">wrapped intelligence</span>
											<span className="rounded-full border border-white/10 px-3 py-1">vendor dependency</span>
										</div>
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
