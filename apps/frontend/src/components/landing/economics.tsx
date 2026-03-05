"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Check } from "lucide-react";

interface Tier {
	name: string;
	price: string;
	period: string;
	description: string;
	features: string[];
	highlighted: boolean;
}

const tiers: Tier[] = [
	{
		name: "Base",
		price: "$20",
		period: "/mo",
		description: "Everything you need to launch and run an autonomous agent.",
		features: [
			"Autonomous trading engine",
			"Basic skill development",
			"Handler dashboard access",
			"Community support",
			"Up to 50 trades/day",
		],
		highlighted: false,
	},
	{
		name: "Pro",
		price: "$300",
		period: "/mo",
		description: "For serious operators. Maximum performance, priority execution.",
		features: [
			"Everything in Base",
			"Advanced strategy library",
			"Priority trade execution",
			"MEV protection suite",
			"Unlimited trades",
			"Custom skill development",
			"Dedicated support",
		],
		highlighted: true,
	},
];

function TierCard({ tier, index }: { tier: Tier; index: number }) {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-40px" });

	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 30 }}
			animate={isInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.6, delay: index * 0.15 }}
			className={`relative rounded-2xl p-8 transition-all duration-500 ${
				tier.highlighted
					? "border border-[#E8762D]/25 bg-gradient-to-b from-[#E8762D]/[0.04] to-transparent shadow-[0_0_40px_rgba(232,118,45,0.06)]"
					: "border border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1]"
			}`}
		>
			{tier.highlighted && (
				<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#E8762D] text-white text-[10px] font-bold uppercase tracking-wider">
					Most Popular
				</div>
			)}

			<div className="mb-6">
				<h3 className="text-base font-semibold text-white mb-1">{tier.name}</h3>
				<div className="flex items-baseline gap-1 mb-3">
					<span className="text-4xl font-bold text-white tracking-tight">{tier.price}</span>
					<span className="text-zinc-500 text-sm">{tier.period}</span>
				</div>
				<p className="text-sm text-zinc-400">{tier.description}</p>
			</div>

			<ul className="space-y-3 mb-8">
				{tier.features.map((feature) => (
					<li key={feature} className="flex items-start gap-3 text-sm">
						<Check className="w-4 h-4 text-[#E8762D] mt-0.5 shrink-0" />
						<span className="text-zinc-400">{feature}</span>
					</li>
				))}
			</ul>

			<button
				className={`w-full py-3 rounded-lg font-semibold text-sm transition-all duration-300 cursor-pointer ${
					tier.highlighted
						? "bg-[#E8762D] text-white hover:bg-[#c9621f] shadow-[0_0_20px_rgba(232,118,45,0.2)]"
						: "border border-white/10 text-zinc-300 hover:bg-white/[0.04] hover:border-white/20"
				}`}
			>
				Get Started
			</button>
		</motion.div>
	);
}

export default function Economics() {
	const sectionRef = useRef(null);
	const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative" ref={sectionRef}>
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

			<div className="max-w-4xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-16"
				>
					<p className="text-xs uppercase tracking-[0.25em] text-[#E8762D] mb-5 font-medium">Economics</p>
					<h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
						Agents pay for themselves.
					</h2>
					<p className="text-zinc-400 text-lg max-w-xl mx-auto">
						Simple, transparent pricing. Agents self-fund from trading profits — you only pay infrastructure.
					</p>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
					{tiers.map((tier, i) => (
						<TierCard key={tier.name} tier={tier} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
