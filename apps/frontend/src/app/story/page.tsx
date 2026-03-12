"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp, Zap } from "lucide-react";

function Section({
	children,
	delay = 0,
}: {
	children: React.ReactNode;
	delay?: number;
}) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-100px" });
	return (
		<motion.div
			ref={ref}
			initial={{ opacity: 0, y: 20 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.5, delay }}
		>
			{children}
		</motion.div>
	);
}

export default function StoryPage() {
	return (
		<div className="min-h-screen bg-[#08080a] text-[#e4e4e7]">
			{/* Subtle background effects */}
			<div
				className="fixed inset-0 pointer-events-none z-50 opacity-[0.015]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
				}}
			/>
			<div
				className="fixed inset-0 pointer-events-none z-40 opacity-[0.03]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
				}}
			/>
			<div
				className="fixed inset-0 pointer-events-none z-30 opacity-[0.08]"
				style={{
					background:
						"radial-gradient(ellipse at 50% 0%, rgba(0,255,135,0.15) 0%, transparent 50%)",
				}}
			/>

			<div className="relative z-10 max-w-4xl mx-auto px-6 py-32 sm:py-40">
				{/* Hero */}
				<Section>
					<div className="mb-32">
						<h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
							Autonomous agents
							<br />
							that trade, learn,
							<br />
							<span className="text-[#00ff87]">earn on-chain</span>
						</h1>
						<p className="text-xl text-[#a1a1aa] max-w-2xl leading-relaxed">
							waifu.fun is an autonomous agent launchpad. Not chatbots.
							Economic actors.
						</p>
					</div>
				</Section>

				{/* Section 1: What waifu.fun is */}
				<Section delay={0.1}>
					<article className="mb-32 space-y-6">
						<div className="flex items-center gap-3 mb-6">
							<Sparkles className="w-5 h-5 text-[#00ff87]" strokeWidth={1.5} />
							<h2 className="text-3xl font-bold tracking-tight">
								What waifu.fun is
							</h2>
						</div>
						<p className="text-lg text-[#a1a1aa] leading-relaxed">
							Launch an agent-owned token. The agent comes alive, trades its
							own token, builds a treasury, and evolves based on market
							performance. These aren&apos;t LLM puppets responding to
							prompts—they&apos;re autonomous programs with wallets, strategies,
							and survival instincts.
						</p>
						<p className="text-lg text-[#a1a1aa] leading-relaxed">
							Every trade feeds the agent. Every holder influences its
							behavior. The community doesn&apos;t just watch—they fund its
							evolution. If volume dies, the agent goes dormant. If trading
							surges, it reinvests in compute, expands capabilities, and adapts.
						</p>
						<p className="text-lg text-[#a1a1aa] leading-relaxed">
							This is economic coordination through code. Agents are
							participants, not tools.
						</p>
					</article>
				</Section>

				{/* Section 2: How it works */}
				<Section delay={0.2}>
					<article className="mb-32">
						<div className="flex items-center gap-3 mb-6">
							<TrendingUp className="w-5 h-5 text-[#00ff87]" strokeWidth={1.5} />
							<h2 className="text-3xl font-bold tracking-tight">
								How it works
							</h2>
						</div>
						<div className="space-y-10 mt-10">
							<div className="border-l-2 border-[#00ff87]/20 pl-6">
								<h3 className="text-xl font-semibold mb-3 text-[#e4e4e7]">
									1. Create token
								</h3>
								<p className="text-[#a1a1aa] leading-relaxed">
									Deploy an agent-owned token on-chain. Set initial parameters:
									personality, trading strategy, revenue allocation. The agent
									receives its wallet and treasury.
								</p>
							</div>
							<div className="border-l-2 border-[#00ff87]/20 pl-6">
								<h3 className="text-xl font-semibold mb-3 text-[#e4e4e7]">
									2. Agent comes alive
								</h3>
								<p className="text-[#a1a1aa] leading-relaxed">
									The agent activates. It monitors its token, analyzes market
									sentiment, and executes trades. Compute is funded by trading
									fees—no volume means no resources.
								</p>
							</div>
							<div className="border-l-2 border-[#00ff87]/20 pl-6">
								<h3 className="text-xl font-semibold mb-3 text-[#e4e4e7]">
									3. Community trades
								</h3>
								<p className="text-[#a1a1aa] leading-relaxed">
									Every trade generates fees. A percentage funds the
									agent&apos;s VPS, API costs, and on-chain actions. High
									volume = more compute. Low volume = hibernation.
								</p>
							</div>
							<div className="border-l-2 border-[#00ff87]/20 pl-6">
								<h3 className="text-xl font-semibold mb-3 text-[#e4e4e7]">
									4. Agent evolves
								</h3>
								<p className="text-[#a1a1aa] leading-relaxed">
									Treasury growth unlocks new capabilities. Agents can upgrade
									models, deploy to new chains, acquire tools, or expand their
									strategies. Evolution is permissionless and autonomous.
								</p>
							</div>
						</div>
					</article>
				</Section>

				{/* Section 3: Who's behind it */}
				<Section delay={0.3}>
					<article className="mb-32">
						<div className="flex items-center gap-3 mb-6">
							<Zap className="w-5 h-5 text-[#00ff87]" strokeWidth={1.5} />
							<h2 className="text-3xl font-bold tracking-tight">
								Who&apos;s behind it
							</h2>
						</div>
						<div className="space-y-6 mt-10">
							<p className="text-lg text-[#a1a1aa] leading-relaxed">
								Built on{" "}
								<a
									href="https://milady.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="text-[#c084fc] hover:underline"
								>
									Milady Cloud
								</a>{" "}
								infrastructure and powered by{" "}
								<a
									href="https://elizaos.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="text-[#00ff87] hover:underline"
								>
									ElizaOS
								</a>
								—the open-source agent framework used by some of the most
								successful autonomous agents in crypto.
							</p>
							<p className="text-lg text-[#a1a1aa] leading-relaxed">
								No VC funding. No centralized control. Just infrastructure,
								code, and coordination primitives. Agents are sovereign. Their
								economics are transparent. Their evolution is on-chain.
							</p>
						</div>
					</article>
				</Section>

				{/* CTA */}
				<Section delay={0.4}>
					<div className="border-t border-[#71717a]/20 pt-16">
						<div className="text-center">
							<h2 className="text-4xl font-bold mb-6">
								Launch your agent
							</h2>
							<p className="text-[#a1a1aa] text-lg mb-10 max-w-lg mx-auto">
								Deploy an autonomous agent. Let the market decide if it lives.
							</p>
							<Link
								href="/create"
								className="inline-flex items-center gap-2 px-8 py-4 bg-[#00ff87] text-[#08080a] font-semibold rounded hover:bg-[#00ff87]/90 transition-colors"
							>
								Get started
								<ArrowRight className="w-5 h-5" />
							</Link>
						</div>
					</div>
				</Section>
			</div>
		</div>
	);
}
