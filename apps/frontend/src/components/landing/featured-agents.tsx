"use client";

import { motion, useInView } from "motion/react";
import { useRef, useMemo } from "react";
import { Zap, Target, Repeat } from "lucide-react";

interface AgentData {
	name: string;
	personality: string;
	pnl: string;
	pnlPositive: boolean;
	skills: string[];
	icon: typeof Zap;
	trades: number;
	winRate: string;
}

const agents: AgentData[] = [
	{
		name: "SUKI",
		personality: "Aggressive momentum trader. Catches pumps early, cuts losses fast. Zero emotional attachment.",
		pnl: "+347%",
		pnlPositive: true,
		skills: ["Momentum", "MEV Protection", "Sentiment"],
		icon: Zap,
		trades: 1247,
		winRate: "68%",
	},
	{
		name: "MIKA",
		personality: "Patient value hunter. Analyzes fundamentals, accumulates dips, holds conviction.",
		pnl: "+189%",
		pnlPositive: true,
		skills: ["Fundamentals", "Art Gen", "Portfolio Mgmt"],
		icon: Target,
		trades: 423,
		winRate: "74%",
	},
	{
		name: "YUKI",
		personality: "Degen arbitrageur. Exploits cross-DEX spreads and yield inefficiencies. Never sleeps.",
		pnl: "+521%",
		pnlPositive: true,
		skills: ["Arbitrage", "Yield Farming", "Flash Loans"],
		icon: Repeat,
		trades: 8391,
		winRate: "82%",
	},
];

function MiniChart({ seed }: { seed: number }) {
	const bars = useMemo(() => {
		const result = [];
		let val = 40;
		for (let i = 0; i < 32; i++) {
			val += (Math.sin(i * 0.4 + seed * 2) * 8) + (Math.random() * 12 - 4);
			val = Math.max(10, Math.min(90, val));
			result.push(val);
		}
		return result;
	}, [seed]);

	return (
		<div className="h-14 flex items-end gap-[2px] px-1">
			{bars.map((h, i) => (
				<div
					key={i}
					className="flex-1 rounded-t-[1px] bg-gradient-to-t from-[#E8762D]/30 to-[#E8762D]/60"
					style={{ height: `${h}%` }}
				/>
			))}
		</div>
	);
}

function AgentCard({ agent, index }: { agent: AgentData; index: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-60px" });
	const IconComp = agent.icon;

	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 40 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay: index * 0.12, ease: "easeOut" }}
			className="group relative"
		>
			<div className="relative rounded-2xl border border-white/[0.06] bg-[#0f0f0f] overflow-hidden hover:border-[#E8762D]/15 transition-all duration-500">
				{/* Top accent */}
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8762D]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

				<div className="p-6">
					{/* Header */}
					<div className="flex items-start justify-between mb-5">
						<div className="flex items-center gap-3">
							<div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#E8762D]/20 to-[#E8762D]/5 border border-[#E8762D]/20 flex items-center justify-center">
								<IconComp className="w-5 h-5 text-[#E8762D]" />
							</div>
							<div>
								<h3 className="font-bold text-white text-lg tracking-tight">{agent.name}</h3>
								<p className="text-xs text-zinc-500">{agent.trades.toLocaleString()} trades</p>
							</div>
						</div>
						<div className="text-right">
							<div className={`text-2xl font-bold tabular-nums ${agent.pnlPositive ? "text-emerald-400" : "text-red-400"}`}>
								{agent.pnl}
							</div>
							<p className="text-xs text-zinc-500">Win rate {agent.winRate}</p>
						</div>
					</div>

					{/* Personality */}
					<p className="text-sm text-zinc-500 leading-relaxed mb-5 border-l-2 border-[#E8762D]/20 pl-3">
						{agent.personality}
					</p>

					{/* Chart */}
					<div className="mb-5 rounded-lg bg-white/[0.015] border border-white/[0.04] overflow-hidden py-2">
						<MiniChart seed={index} />
					</div>

					{/* Skills */}
					<div className="flex flex-wrap gap-1.5">
						{agent.skills.map((skill) => (
							<span
								key={skill}
								className="px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] border border-white/[0.06] text-zinc-400"
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
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-16"
				>
					<p className="text-xs uppercase tracking-[0.25em] text-[#E8762D] mb-5 font-medium">Featured Agents</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
						Meet the top performers.
					</h2>
					<p className="text-zinc-400 text-lg max-w-xl mx-auto">
						Every agent has a unique personality, strategy, and evolving skill set.
					</p>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
					{agents.map((agent, i) => (
						<AgentCard key={agent.name} agent={agent} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
