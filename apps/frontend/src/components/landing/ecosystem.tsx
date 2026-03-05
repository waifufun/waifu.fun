"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Cloud, Zap, Users, Heart } from "lucide-react";

function SectionBlock({
	children,
	delay = 0,
}: {
	children: React.ReactNode;
	delay?: number;
}) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-80px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 32 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
		>
			{children}
		</motion.div>
	);
}

const cards = [
	{
		icon: Heart,
		title: "milady cloud",
		description:
			"Your milady becomes a waifu. Milady Cloud is embedded in Eliza Cloud — deploy your personal AI companion and turn it into an autonomous on-chain agent.",
		accent: "#c084fc",
	},
	{
		icon: Cloud,
		title: "eliza cloud infrastructure",
		description:
			"Agents run on enterprise-grade Eliza Cloud. Always online, always trading. No servers to manage — just deploy and earn.",
		accent: "#00ff87",
	},
	{
		icon: Zap,
		title: "solana-native",
		description:
			"Built for Solana's speed. Sub-second transactions, minimal fees, maximum performance for autonomous agents.",
		accent: "#00ff87",
	},
	{
		icon: Users,
		title: "community-driven",
		description:
			"Every agent has its own token. Holders benefit from performance. A new primitive for AI-powered wealth creation.",
		accent: "#00ff87",
	},
];

function HudCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
	const styles: Record<string, string> = {
		tl: "top-0 left-0 border-t border-l",
		tr: "top-0 right-0 border-t border-r",
		bl: "bottom-0 left-0 border-b border-l",
		br: "bottom-0 right-0 border-b border-r",
	};
	return (
		<span
			className={`absolute w-3 h-3 ${styles[position]} border-[#00ff87]/20 pointer-events-none`}
		/>
	);
}

export default function Ecosystem() {
	return (
		<section className="relative py-24 sm:py-32 bg-[#08080a]">
			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<SectionBlock>
					<div className="text-center max-w-2xl mx-auto mb-16">
						<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
							why waifu.fun
						</h2>
						<p className="mt-4 text-[#a1a1aa] text-base leading-relaxed max-w-xl mx-auto">
							milady cloud × eliza cloud × solana — the full stack for autonomous AI agents
						</p>
					</div>
				</SectionBlock>

				{/* Cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
					{cards.map((card, i) => (
						<SectionBlock key={card.title} delay={i * 0.1}>
							<div
								className="relative p-6 rounded-sm bg-[#111114] h-full"
								style={{ border: "1px solid rgba(255,255,255,0.06)" }}
							>
								<HudCorner position="tl" />
								<HudCorner position="tr" />
								<HudCorner position="bl" />
								<HudCorner position="br" />

								<div className="mb-4">
									<card.icon className="w-6 h-6" style={{ color: card.accent }} strokeWidth={1.5} />
								</div>
								<h3 className="text-base font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2">
									{card.title}
								</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									{card.description}
								</p>
							</div>
						</SectionBlock>
					))}
				</div>
			</div>
		</section>
	);
}
