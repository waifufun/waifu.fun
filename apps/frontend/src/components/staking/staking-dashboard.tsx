"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight, Lock, TrendingUp, Wallet, Zap } from "lucide-react";
import { useRef, useState } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

function RevealBlock({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-60px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 24 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay, ease: EASE }}
		>
			{children}
		</motion.div>
	);
}

const STATS = [
	{ label: "total staked", value: "--", sub: "WAIFU", icon: Lock },
	{ label: "staking APY", value: "--", sub: "estimated", icon: TrendingUp },
	{ label: "total distributed", value: "--", sub: "WAIFU in fees", icon: Zap },
	{ label: "your veWAIFU", value: "--", sub: "live soon", icon: Wallet },
];

export default function StakingDashboard() {
	const [stakeAmount, setStakeAmount] = useState("");
	const [withdrawAmount, setWithdrawAmount] = useState("");

	return (
		<div className="min-h-[100dvh] bg-[#08080a] text-[#e4e4e7]">
			{/* Stats ribbon */}
			<section className="border-b border-[rgba(255,255,255,0.06)] bg-[#0a0a0d]">
				<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
					<RevealBlock>
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
							{STATS.map((stat, i) => {
								const Icon = stat.icon;
								return (
									<motion.div
										key={stat.label}
										initial={{ opacity: 0, y: 16 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.1 + i * 0.08, ease: EASE }}
										className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 group hover:border-[rgba(0,255,135,0.15)] transition-colors duration-500"
									>
										<div className="flex items-center gap-2 mb-3">
											<Icon className="w-3.5 h-3.5 text-[#52525b] group-hover:text-[#00ff87] transition-colors" strokeWidth={1.5} />
											<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">{stat.label}</span>
										</div>
										<div className="flex items-baseline gap-2">
											<span className="font-mono text-2xl font-bold text-[#00ff87] tracking-tight">{stat.value}</span>
											<span className="font-mono text-[10px] text-[#3f3f46]">{stat.sub}</span>
										</div>
									</motion.div>
								);
							})}
						</div>
					</RevealBlock>
				</div>
			</section>

			{/* Main content */}
			<section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
				<RevealBlock>
					<div className="mb-10">
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-3">veWAIFU staking</span>
						<h1 className="font-satoshi text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] lowercase">
							stake waifu.{" "}
							<span className="text-[#52525b]">earn from every agent.</span>
						</h1>
						<p className="mt-4 text-[#71717a] text-base max-w-lg">
							your staked WAIFU earns 25% of all trading fees across the platform. every agent trade, every bonding curve swap, every graduation.
						</p>
					</div>
				</RevealBlock>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					{/* Stake Card */}
					<div className="lg:col-span-7">
						<RevealBlock delay={0.1}>
							<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] overflow-hidden">
								{/* Card header */}
								<div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
									<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">position</span>
									<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]/60">active</span>
								</div>

								{/* Stake input */}
								<div className="p-6 space-y-6">
									<div>
										<label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b] block mb-3">stake amount</label>
										<div className="flex items-center gap-3">
											<div className="flex-1 relative">
												<input
													type="text"
													value={stakeAmount}
													onChange={(e) => setStakeAmount(e.target.value)}
													placeholder="0.00"
													className="w-full bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm px-4 py-3 font-mono text-lg text-[#e4e4e7] placeholder-[#3f3f46] focus:outline-none focus:border-[rgba(0,255,135,0.3)] transition-colors"
												/>
												<span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-[#52525b]">WAIFU</span>
											</div>
											<button
												type="button"
												className="px-3 py-3 rounded-sm border border-[rgba(255,255,255,0.06)] text-[10px] font-mono uppercase tracking-wider text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.12)] transition-colors"
											>
												max
											</button>
										</div>
									</div>

									<motion.button
										type="button"
										whileHover={{ scale: 1.01 }}
										whileTap={{ scale: 0.98 }}
										className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#00ff87] text-[#08080a] font-medium text-sm uppercase tracking-wide rounded-sm transition-shadow hover:shadow-[0_0_24px_rgba(0,255,135,0.15)]"
									>
										stake WAIFU
										<ArrowRight className="w-4 h-4" strokeWidth={2} />
									</motion.button>

									{/* Withdraw section */}
									<div className="pt-4 border-t border-[rgba(255,255,255,0.04)]">
										<label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b] block mb-3">withdraw</label>
										<div className="flex items-center gap-3">
											<input
												type="text"
												value={withdrawAmount}
												onChange={(e) => setWithdrawAmount(e.target.value)}
												placeholder="0.00"
												className="flex-1 bg-[#08080a] border border-[rgba(255,255,255,0.06)] rounded-sm px-4 py-3 font-mono text-lg text-[#e4e4e7] placeholder-[#3f3f46] focus:outline-none focus:border-[rgba(0,255,135,0.3)] transition-colors"
											/>
											<button
												type="button"
												className="px-6 py-3 rounded-sm border border-[rgba(255,255,255,0.08)] text-sm font-medium text-[#71717a] hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.16)] transition-colors"
											>
												withdraw
											</button>
										</div>
									</div>
								</div>
							</div>
						</RevealBlock>
					</div>

					{/* Rewards Card */}
					<div className="lg:col-span-5">
						<RevealBlock delay={0.2}>
							<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] overflow-hidden">
								<div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
									<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">rewards</span>
								</div>
								<div className="p-6 space-y-6">
									{/* Earned display */}
									<div className="text-center py-8">
										<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b] block mb-4">earned</span>
										<motion.div
											className="font-mono text-5xl font-bold text-[#00ff87] tracking-tight"
											animate={{ opacity: [0.8, 1, 0.8] }}
											transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
										>
											0.00
										</motion.div>
										<span className="font-mono text-sm text-[#3f3f46] mt-2 block">WAIFU</span>
									</div>

									{/* Claim button */}
									<motion.button
										type="button"
										whileHover={{ scale: 1.02 }}
										whileTap={{ scale: 0.98 }}
										className="w-full px-6 py-3.5 rounded-sm border border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.05)] text-[#00ff87] font-medium text-sm uppercase tracking-wide transition-all hover:bg-[rgba(0,255,135,0.1)] hover:border-[rgba(0,255,135,0.3)]"
									>
										claim rewards
									</motion.button>

									{/* Exit button */}
									<button
										type="button"
										className="w-full px-6 py-3 rounded-sm border border-[rgba(255,255,255,0.06)] text-[#52525b] font-mono text-[10px] uppercase tracking-wider hover:text-[#71717a] hover:border-[rgba(255,255,255,0.1)] transition-colors"
									>
										exit (withdraw all + claim)
									</button>

									{/* Info */}
									<div className="pt-4 border-t border-[rgba(255,255,255,0.04)] space-y-2">
										<div className="flex justify-between">
											<span className="font-mono text-[10px] text-[#3f3f46]">fee share</span>
											<span className="font-mono text-[10px] text-[#71717a]">25% of all trades</span>
										</div>
										<div className="flex justify-between">
											<span className="font-mono text-[10px] text-[#3f3f46]">lock period</span>
											<span className="font-mono text-[10px] text-[#71717a]">none (v1)</span>
										</div>
										<div className="flex justify-between">
											<span className="font-mono text-[10px] text-[#3f3f46]">reward token</span>
											<span className="font-mono text-[10px] text-[#00ff87]">WAIFU</span>
										</div>
									</div>
								</div>
							</div>
						</RevealBlock>
					</div>
				</div>
			</section>
		</div>
	);
}
