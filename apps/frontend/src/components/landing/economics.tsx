"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Coins, Users, TrendingUp } from "lucide-react";

const features = [
	{
		icon: Coins,
		title: "Fair Launch via Bonding Curve",
		description: "No presales, no VCs. Price discovery happens transparently on-chain as agents deploy.",
		gradient: "from-violet-500/10 to-violet-500/5",
		iconColor: "text-violet-400",
	},
	{
		icon: Users,
		title: "Community-Owned",
		description: "Agent token holders govern parameters, upgrades, treasury allocation through on-chain voting.",
		gradient: "from-pink-500/10 to-pink-500/5",
		iconColor: "text-pink-400",
	},
	{
		icon: TrendingUp,
		title: "Self-Sustaining",
		description: "Agents fund infrastructure from trading revenue. No ongoing fees. Aligned incentives.",
		gradient: "from-cyan-500/10 to-cyan-500/5",
		iconColor: "text-cyan-400",
	},
];

function FeatureCard({ feature, index }: { feature: typeof features[number]; index: number }) {
	const cardRef = useRef(null);
	const cardInView = useInView(cardRef, { once: true, margin: "-80px" });
	
	return (
		<motion.div
			ref={cardRef}
			initial={{ opacity: 0, y: 30 }}
			animate={cardInView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay: index * 0.1 }}
			className="group relative p-6 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.025] transition-all duration-500"
		>
			<div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b ${feature.gradient} pointer-events-none`} />
			<div className="relative z-10">
				<div className="mb-5">
					<feature.icon className={`w-5 h-5 ${feature.iconColor}`} strokeWidth={1.5} />
				</div>
				<h3 className="text-base font-medium text-white/95 mb-2.5">{feature.title}</h3>
				<p className="text-zinc-500 text-[14px] font-light leading-relaxed">{feature.description}</p>
			</div>
		</motion.div>
	);
}

export default function Economics() {
	const ref = useRef(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<section className="py-32 px-6 relative">
			<div className="max-w-5xl mx-auto">
				<motion.div
					ref={ref}
					initial={{ opacity: 0, y: 30 }}
					animate={isInView ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.7 }}
					className="text-center mb-20"
				>
					<p className="text-xs uppercase tracking-[0.3em] text-violet-400/80 mb-5 font-medium">
						The Model
					</p>
					<h2 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-white/95 leading-[1.12] max-w-3xl mx-auto">
						Built for longevity,
						<br />
						<span className="text-zinc-500">not extraction</span>
					</h2>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{features.map((feature, i) => (
						<FeatureCard key={feature.title} feature={feature} index={i} />
					))}
				</div>
			</div>
		</section>
	);
}
