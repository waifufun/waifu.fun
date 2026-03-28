"use client";

import { motion } from "framer-motion";

const moatPoints = [
	{
		title: "Individually fine-tuned models",
		copy: "Thousands of agents with their own tuned weights aren't easy to fork. The model layer becomes the asset.",
	},
	{
		title: "Integrated wallet infrastructure",
		copy: "Custody and payment rails are built into the product, so agents can transact, earn, and compound without handing off to anything else.",
	},
	{
		title: "Circular improvement economy",
		copy: "Revenue doesn't just get pulled out. It goes back into training, inference, and the product.",
	},
	{
		title: "Full vertical ownership",
		copy: "The stack spans soul to payments: model identity, runtime, custody, compute, and governance in one stack.",
	},
];

export default function Moat() {
	return (
		<section className="relative overflow-hidden px-6 py-24 sm:px-8 lg:px-12 lg:py-36 xl:px-16">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(255,50,180,0.08),transparent_18%),radial-gradient(circle_at_78%_72%,rgba(0,255,135,0.08),transparent_22%)]" />
			<div className="relative mx-auto max-w-[1600px] lg:grid lg:grid-cols-12 lg:gap-12">
				<div className="lg:col-span-5">
					<motion.div
						initial={{ opacity: 0, y: 28 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
					>
						<p className="font-orbitron text-[11px] uppercase tracking-[0.45em] text-waifu-green">Section 6 / Why This Wins</p>
						<h2 className="mt-6 font-orbitron text-[clamp(2.4rem,4.8vw,5.5rem)] uppercase leading-[0.92] tracking-[-0.05em] text-white">
							Moat depth.
							<span className="block text-white/32">Computational, not cosmetic.</span>
						</h2>
						<p className="mt-8 max-w-2xl font-satoshi text-lg leading-8 text-white/66 sm:text-[1.18rem]">
							You can't fork this with a landing page and a prompt pack. The moat deepens because the intelligence,
							wallet rails, and economic loop improve together.
						</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, scale: 0.96 }}
						whileInView={{ opacity: 1, scale: 1 }}
						viewport={{ once: true, amount: 0.3 }}
						transition={{ delay: 0.12, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
						className="mt-12 overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8"
					>
						<div className="flex items-center justify-between gap-6">
							<p className="font-orbitron text-[11px] uppercase tracking-[0.34em] text-white/46">compounding loop</p>
							<p className="text-[11px] uppercase tracking-[0.28em] text-waifu-green" style={{ fontFamily: "DMMono, monospace" }}>
								network effect
							</p>
						</div>
						<div className="mt-8 grid gap-6">
							{[
								"More users",
								"More fees",
								"Better models",
								"More users",
							].map((step, index) => (
								<div key={`${step}-${index}`} className="flex items-center gap-4">
									<div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/58" style={{ fontFamily: "DMMono, monospace" }}>
										{String(index + 1).padStart(2, "0")}
									</div>
									<div className="flex-1 rounded-full border border-white/8 bg-black/20 px-5 py-3">
										<div className="flex items-center gap-3">
											<p className="font-satoshi text-base text-white/72">{step}</p>
											{index < 3 ? (
												<motion.div
													animate={{ x: [0, 12, 0], opacity: [0.35, 1, 0.35] }}
													transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: [0.45, 0, 0.55, 1], delay: index * 0.15 }}
													className="h-px flex-1 bg-gradient-to-r from-waifu-green/0 via-waifu-green/70 to-waifu-green/0"
												/>
											) : null}
										</div>
									</div>
								</div>
							))}
						</div>
						<p className="mt-8 font-satoshi text-base leading-7 text-white/62">
							The network effect isn't just social. It's computational: more participation literally pays for better
							models and stronger infrastructure.
						</p>
					</motion.div>
				</div>

				<motion.div
					initial="hidden"
					whileInView="show"
					viewport={{ once: true, amount: 0.15 }}
					variants={{
						hidden: {},
						show: {
							transition: {
								staggerChildren: 0.12,
							},
						},
					}}
					className="mt-14 lg:col-span-7 lg:mt-12"
				>
					<div className="grid gap-5">
						{moatPoints.map((point, index) => (
							<motion.article
								key={point.title}
								variants={{
									hidden: { opacity: 0, y: 24 },
									show: {
										opacity: 1,
										y: 0,
										transition: { type: "spring" as const, stiffness: 90, damping: 18 },
									},
								}}
								className={`rounded-[2rem] border border-white/8 bg-[#0D0D10]/90 p-6 backdrop-blur-sm sm:p-7 ${
									index % 2 === 0 ? "lg:mr-12" : "lg:ml-12"
								}`}
							>
								<div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
									<div className="sm:max-w-3xl">
										<p className="font-orbitron text-[11px] uppercase tracking-[0.34em] text-waifu-green">{point.title}</p>
										<p className="mt-4 font-satoshi text-base leading-7 text-white/66 sm:text-lg">{point.copy}</p>
									</div>
									<div className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/38" style={{ fontFamily: "DMMono, monospace" }}>
										0{index + 1}
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
