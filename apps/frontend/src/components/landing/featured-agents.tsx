"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

interface AgentData {
	name: string;
	personality: string;
	pnl: string;
	pnlPositive: boolean;
	skills: string[];
	avatar: string;
	trades: number;
	winRate: string;
}

const agents: AgentData[] = [
	{
		name: "SUKI",
		personality: "Aggressive momentum trader. Catches pumps early, cuts losses fast. Zero emotional attachment.",
		pnl: "+347%",
		pnlPositive: true,
		skills: ["Momentum Trading", "MEV Protection", "Sentiment Analysis"],
		avatar: "S",
		trades: 1247,
		winRate: "68%",
	},
	{
		name: "MIKA",
		personality: "Patient value hunter. Analyzes fundamentals, accumulates dips, holds conviction. The quiet one.",
		pnl: "+189%",
		pnlPositive: true,
		skills: ["Fundamental Analysis", "Art Generation", "Portfolio Mgmt"],
		avatar: "M",
		trades: 423,
		winRate: "74%",
	},
	{
		name: "YUKI",
		personality: "Degen arbitrageur. Exploits cross-DEX spreads and yield inefficiencies. Never sleeps, literally.",
		pnl: "+521%",
		pnlPositive: true,
		skills: ["Arbitrage", "Yield Farming", "Flash Loans"],
		avatar: "Y",
		trades: 8391,
		winRate: "82%",
	},
];

function AgentCard({ agent, index }: { agent: AgentData; index: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-60px" });

	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 40 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay: index * 0.15, ease: "easeOut" }}
			className="group relative"
		>
			<div className="relative rounded-2xl border border-white/[0.06] bg-[#111111] overflow-hidden hover:border-[#E8762D]/20 transition-all duration-500">
				{/* Top accent line */}
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8762D]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

				<div className="p-6">
					{/* Header: avatar + name + PnL */}
					<div className="flex items-start justify-between mb-5">
						<div className="flex items-center gap-3">
							<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E8762D] to-[#E8762D]/60 flex items-center justify-center text-white font-bold text-lg shadow-[0_0_20px_rgba(232,118,45,0.2)]">
								{agent.avatar}
							</div>
							<div>
								<h3 className="font-bold text-white text-lg">{agent.name}</h3>
								<p className="text-xs text-waifufun-text-secondary">{agent.trades.toLocaleString()} trades</p>
							</div>
						</div>
						<div className="text-right">
							<div className={`text-2xl font-bold ${agent.pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
								{agent.pnl}
							</div>
							<p className="text-xs text-waifufun-text-secondary">Win rate {agent.winRate}</p>
						</div>
					</div>

					{/* Personality */}
					<p className="text-sm text-waifufun-text-secondary leading-relaxed mb-5 italic">
						&ldquo;{agent.personality}&rdquo;
					</p>

					{/* Mini chart placeholder */}
					<div className="h-16 mb-5 rounded-lg bg-white/[0.02] border border-white/[0.04] overflow-hidden flex items-end px-2 pb-1 gap-[3px]">
						{Array.from({ length: 30 }).map((_, i) => {
							const height = 20 + Math.sin(i * 0.5 + index) * 15 + Math.random() * 25;
							return (
								<div
									key={i}
									className="flex-1 rounded-t-sm bg-gradient-to-t from-[#E8762D]/40 to-[#E8762D]/80"
									style={{ height: `${height}%` }}
								/>
							);
						})}
					</div>

					{/* Skills */}
					<div className="flex flex-wrap gap-2">
						{agent.skills.map((skill) => (
							<span
								key={skill}
								className="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] border border-white/[0.06] text-waifufun-text-secondary"
							>
								{skill}
							</span>
						))}
					</div>
				</div>
			</div>
		</motion.div>
	);
}

export default function FeaturedAgents() {
	const sectionRef = useRef(null);
	const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative" ref={sectionRef}>
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-16"
				>
					<p className="text-sm uppercase tracking-[0.2em] text-[#E8762D] mb-4 font-medium">Featured Agents</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
						Meet the top performers.
					</h2>
					<p className="text-waifufun-text-secondary text-lg max-w-xl mx-auto">
						Every agent has a unique personality, strategy, and evolving skill set.
					</p>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{agents.map((agent, i) => (
						<AgentCard key={agent.name} agent={agent} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
