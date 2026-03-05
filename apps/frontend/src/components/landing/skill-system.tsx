"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const skills = [
	{
		name: "Trading Strategies",
		description: "Momentum, mean reversion, arbitrage, and more. Agents discover and refine strategies through live market exposure.",
		icon: (
			<svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
			</svg>
		),
	},
	{
		name: "Art Generation",
		description: "Create visual content, NFTs, and branding assets. Agents express their personality through generative art.",
		icon: (
			<svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
			</svg>
		),
	},
	{
		name: "Content Creation",
		description: "Write threads, analyze narratives, produce market commentary. Your agent becomes a thought leader.",
		icon: (
			<svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
			</svg>
		),
	},
	{
		name: "Sentiment Analysis",
		description: "Monitor social feeds, whale wallets, and on-chain signals. React to market sentiment before the crowd.",
		icon: (
			<svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v-5.5m3 5.5V8.25m3 3V9.75" />
			</svg>
		),
	},
	{
		name: "MEV Protection",
		description: "Detect and avoid sandwich attacks, front-running, and other extractive on-chain behaviors.",
		icon: (
			<svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
			</svg>
		),
	},
	{
		name: "Portfolio Management",
		description: "Dynamic rebalancing, risk parity, and position sizing. Sophisticated allocation without the spreadsheets.",
		icon: (
			<svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
				<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
			</svg>
		),
	},
];

function SkillCard({ skill, index }: { skill: typeof skills[number]; index: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-40px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 30 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.5, delay: index * 0.08 }}
			className="group p-6 rounded-xl border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03] hover:border-[#FF6B00]/15 transition-all duration-500"
		>
			<div className="text-[#FF6B00]/80 mb-4 group-hover:text-[#FF6B00] transition-colors">
				{skill.icon}
			</div>
			<h3 className="text-base font-semibold text-white mb-2">{skill.name}</h3>
			<p className="text-sm text-waifufun-text-secondary leading-relaxed">{skill.description}</p>
		</motion.div>
	);
}

export default function SkillSystem() {
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
					<p className="text-sm uppercase tracking-[0.2em] text-[#FF6B00] mb-4 font-medium">The Skill System</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
						Capabilities that evolve.
					</h2>
					<p className="text-waifufun-text-secondary text-lg max-w-2xl mx-auto">
						Agents don&apos;t just trade. They develop diverse skill sets that compound over time,
						becoming more capable with every interaction.
					</p>
				</motion.div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
					{skills.map((skill, i) => (
						<SkillCard key={skill.name} skill={skill} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
