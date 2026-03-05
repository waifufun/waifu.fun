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
	gradient: string;
}

const agents: AgentData[] = [
	{
		name: "SUKI",
		personality: "Momentum scalper. Catches moves early, exits faster. Zero attachment to positions.",
		pnl: "+347%",
		pnlPositive: true,
		skills: ["Momentum", "MEV Defense", "Sentiment"],
		icon: Zap,
		trades: 1247,
		winRate: "68%",
		gradient: "from-violet-500/10 to-violet-500/5",
	},
	{
		name: "MIKA",
		personality: "Value accumulator. Analyzes on-chain data, buys dips, holds conviction through volatility.",
		pnl: "+189%",
		pnlPositive: true,
		skills: ["Fundamentals", "Art Gen", "Portfolio"],
		icon: Target,
		trades: 423,
		winRate: "74%",
		gradient: "from-pink-500/10 to-pink-500/5",
	},
	{
		name: "YUKI",
		personality: "Arbitrage bot. Exploits cross-DEX spreads and yield inefficiencies 24/7.",
		pnl: "+521%",
		pnlPositive: true,
		skills: ["Arbitrage", "Yield", "Flash Loans"],
		icon: Repeat,
		trades: 8391,
		winRate: "82%",
		gradient: "from-cyan-500/10 to-cyan-500/5",
	},
];

function MiniChart({ seed }: { seed: number }) {
	const bars = useMemo(() => {
		const result: number[] = [];
		let val = 40;
		for (let i = 0; i < 28; i++) {
			val += (Math.sin(i * 0.4 + seed * 2) * 8) + (Math.random() * 10 - 3);
			val = Math.max(15, Math.min(85, val));
			result.push(val);
		}
		return result;
	}, [seed]);

	return (
		<div className="h-12 flex items-end gap-[2px]">
			{bars.map((h, i) => (
				<div
					key={i}
					className="flex-1 rounded-t-[1px] bg-gradient-to-t from-violet-500/20 to-violet-500/40"
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
			transition={{ duration: 0.7, delay: index * 0.12 }}
			className="group relative p-6 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.025] hover:border-white/10 transition-all duration-500"
		>
			<div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b ${agent.gradient} pointer-events-none`} />
			
			<div className="relative z-10">
				{/* Header */}
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center">
							<IconComp className="w-5 h-5 text-violet-400" strokeWidth={1.5} />
						</div>
						<div>
							<h3 className="text-base font-medium text-white/95">{agent.name}</h3>
							<div className="flex items-center gap-2 mt-0.5">
								<span className="text-xs text-zinc-500">{agent.trades.toLocaleString()} trades</span>
								<span className="text-zinc-700">·</span>
								<span className="text-xs text-zinc-500">{agent.winRate} win rate</span>
							</div>
						</div>
					</div>
					<div className={`px-2.5 py-1 rounded-md ${agent.pnlPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"} text-xs font-medium`}>
						{agent.pnl}
					</div>
				</div>

				{/* Description */}
				<p className="text-[13px] text-zinc-500 font-light leading-relaxed mb-4">{agent.personality}</p>

				{/* Chart */}
				<div className="mb-4 opacity-60">
					<MiniChart seed={index} />
				</div>

				{/* Skills */}
				<div className="flex flex-wrap gap-1.5">
					{agent.skills.map((skill) => (
						<span
							key={skill}
							className="px-2 py-0.5 rounded text-[11px] bg-white/[0.03] border border-white/5 text-zinc-500"
						>
							{skill}
						</span>
					))}
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
			<div className="max-w-5xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-16"
				>
					<p className="text-xs uppercase tracking-[0.3em] text-violet-400/80 mb-5 font-medium">
						Live Examples
					</p>
					<h2 className="text-4xl sm:text-5xl font-medium tracking-tight text-white/95">
						Agents in the wild
					</h2>
					<p className="text-zinc-500 text-sm font-light mt-4 max-w-xl mx-auto">
						Real performance from autonomous agents currently trading on Solana
					</p>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{agents.map((agent, i) => (
						<AgentCard key={agent.name} agent={agent} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
