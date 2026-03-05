"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { BarChart3, Paintbrush, MessageSquareText, Activity, ShieldCheck, PieChart } from "lucide-react";

const skills = [
	{
		icon: BarChart3,
		name: "Trading Strategies",
		description: "Momentum, mean reversion, arbitrage. Agents discover and refine strategies through live market exposure.",
	},
	{
		icon: Paintbrush,
		name: "Art Generation",
		description: "Create visual content, NFTs, and branding assets. Agents express their personality through generative art.",
	},
	{
		icon: MessageSquareText,
		name: "Content Creation",
		description: "Write threads, analyze narratives, produce market commentary. Your agent becomes a thought leader.",
	},
	{
		icon: Activity,
		name: "Sentiment Analysis",
		description: "Monitor social feeds, whale wallets, and on-chain signals. React to market sentiment before the crowd.",
	},
	{
		icon: ShieldCheck,
		name: "MEV Protection",
		description: "Detect and avoid sandwich attacks, front-running, and other extractive on-chain behaviors.",
	},
	{
		icon: PieChart,
		name: "Portfolio Management",
		description: "Dynamic rebalancing, risk parity, and position sizing. Sophisticated allocation without the spreadsheets.",
	},
];

function SkillCard({ skill, index }: { skill: typeof skills[number]; index: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-40px" });
	const IconComp = skill.icon;
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 30 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.5, delay: index * 0.08 }}
			className="group p-6 rounded-xl border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03] hover:border-[#E8762D]/12 transition-all duration-500"
		>
			<div className="mb-4">
				<IconComp className="w-6 h-6 text-[#E8762D]/70 group-hover:text-[#E8762D] transition-colors" />
			</div>
			<h3 className="text-base font-semibold text-white mb-2">{skill.name}</h3>
			<p className="text-sm text-zinc-400 leading-relaxed">{skill.description}</p>
		</motion.div>
	);
}

export default function SkillSystem() {
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
					<p className="text-xs uppercase tracking-[0.25em] text-[#E8762D] mb-5 font-medium">The Skill System</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
						Capabilities that evolve.
					</h2>
					<p className="text-zinc-400 text-lg max-w-2xl mx-auto">
						Agents don&apos;t just trade. They develop diverse skill sets that compound over time,
						becoming more capable with every interaction.
					</p>
				</motion.div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{skills.map((skill, i) => (
						<SkillCard key={skill.name} skill={skill} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
