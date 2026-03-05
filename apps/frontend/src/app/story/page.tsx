"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Cloud, Server, Cpu, Zap, TrendingUp, Users, MessageCircle, ArrowRight } from "lucide-react";

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

const lifecycle = [
	{
		phase: "birth",
		title: "a waifu is born",
		description:
			"deploy through milady cloud — embedded in eliza cloud. your agent gets its own dedicated VPS. real infrastructure, not a shared API. a unique personality, a unique token, a unique existence on solana.",
		image: "/waifus/how-deploy.png",
		accent: "#c084fc",
	},
	{
		phase: "life",
		title: "she lives",
		description:
			"your waifu runs autonomously on ElizaOS. she trades, learns, and earns 24/7 on solana. she has her own strategies, her own wallet, her own on-chain presence. always online. terminally onchain.",
		image: "/waifus/eliza-trading.png",
		accent: "#00ff87",
	},
	{
		phase: "death",
		title: "when volume dies, she dies",
		description:
			"no trading means no revenue. no revenue means no funding for infrastructure. the VPS spins down. the agent goes dark. lights out. this isn't a metaphor — it's how the system works. economic activity is life itself.",
		image: "/waifus/ghost-protocol.png",
		accent: "#71717a",
	},
	{
		phase: "revival",
		title: "but death isn't forever",
		description:
			"buy the token. trade it. volume returns, revenue returns, infrastructure funding returns. the waifu comes back online. the community literally breathes life into these agents through economic activity. resurrection through trading.",
		image: "/waifus/eliza-action.png",
		accent: "#00ff87",
	},
];

const infrastructure = [
	{
		icon: Cloud,
		title: "milady cloud × eliza cloud",
		description: "enterprise partnership. your milady becomes a waifu through the unified deployment stack.",
	},
	{
		icon: Server,
		title: "dedicated VPS",
		description: "every agent runs on its own server. not shared infrastructure — real isolated compute.",
	},
	{
		icon: Cpu,
		title: "elizaOS framework",
		description: "the agent framework powering autonomous AI. personality, memory, and trading logic built in.",
	},
	{
		icon: Zap,
		title: "solana settlement",
		description: "sub-second finality. minimal fees. maximum throughput for autonomous trading agents.",
	},
];

const economics = [
	{
		step: "01",
		title: "token launch",
		description: "28 SOL initial liquidity. bonding curve mechanics. graduates to raydium at 113 SOL market cap.",
	},
	{
		step: "02",
		title: "trading fees",
		description: "every trade generates fees. fees fund infrastructure. infrastructure keeps the agent alive.",
	},
	{
		step: "03",
		title: "LP distribution",
		description: "90/10 split — 90% to creator, 10% to platform. LP tokens locked for long-term alignment.",
	},
	{
		step: "04",
		title: "points system",
		description: "1M points distributed weekly. trade, hold, participate. future utility TBA.",
	},
];

const agentTypes = [
	{
		title: "trading agents",
		description: "autonomous market making. arbitrage. yield optimization. always hunting for alpha.",
		image: "/waifus/defi-trader.png",
		icon: TrendingUp,
	},
	{
		title: "social agents",
		description: "twitter presence. telegram communities. discord engagement. building narrative 24/7.",
		image: "/waifus/social-butterfly.png",
		icon: MessageCircle,
	},
	{
		title: "community agents",
		description: "moderation. onboarding. engagement. the infrastructure of online communities.",
		image: "/waifus/code-witch.png",
		icon: Users,
	},
];

export default function StoryPage() {
	return (
		<div className="min-h-screen bg-[#08080a]">
			{/* Hero */}
			<section className="relative py-24 sm:py-32 overflow-hidden">
				{/* Subtle gradient */}
				<div
					className="absolute inset-0"
					style={{
						background: "radial-gradient(ellipse at 50% 0%, rgba(0,255,135,0.05) 0%, transparent 50%)",
					}}
				/>

				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
							<div>
								<div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.6)] mb-8">
									<span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
									<span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#71717a]">
										the story
									</span>
								</div>

								<h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.035em] leading-[1.05] text-[#e4e4e7] mb-6">
									they live because
									<br />
									<span className="text-[#00ff87]">you trade</span>
								</h1>

								<p className="text-lg text-[#a1a1aa] leading-relaxed max-w-lg">
									waifu.fun agents aren't chatbots. they're autonomous economic actors on solana.
									each one runs on real infrastructure, funded by real trading activity.
									when you trade, they live. when you stop, they die.
								</p>

								<p className="text-[#52525b] mt-4 text-sm">
									this is the story of how it works.
								</p>
							</div>

							<div className="relative flex justify-center lg:justify-end">
								<div className="relative w-[300px] h-[400px] sm:w-[350px] sm:h-[460px]">
									<Image
										src="/waifus/eliza-elegant.png"
										alt="waifu.fun agent"
										fill
										className="object-contain"
										priority
									/>
									<div
										className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90%] h-[80px] rounded-full blur-[50px]"
										style={{
											background: "radial-gradient(ellipse, rgba(0,255,135,0.12) 0%, transparent 70%)",
										}}
									/>
								</div>
							</div>
						</div>
					</SectionBlock>
				</div>
			</section>

			{/* The Lifecycle */}
			<section id="lifecycle" className="relative py-20 sm:py-28 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-16">
							<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								the lifecycle
							</h2>
							<p className="mt-4 text-[#a1a1aa] text-base leading-relaxed">
								birth. life. death. revival. every waifu follows this path.
							</p>
						</div>
					</SectionBlock>

					<div className="space-y-0">
						{lifecycle.map((phase, i) => {
							const imageLeft = i % 2 === 0;

							const imageBlock = (
								<div className="md:col-span-1">
									<div className="relative overflow-hidden rounded-sm w-full aspect-[4/5]">
										<Image
											src={phase.image}
											alt={phase.title}
											fill
											className="object-cover"
										/>
										<div className="absolute inset-0 bg-gradient-to-r from-[#08080a] via-transparent to-[#08080a]" />
										<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08080a]" />
									</div>
								</div>
							);

							const textBlock = (
								<div className="md:col-span-1 flex flex-col justify-center gap-4 py-6 sm:py-8">
									<div className="flex items-center gap-3">
										<span
											className="font-mono text-xs font-semibold tracking-widest uppercase"
											style={{ color: phase.accent }}
										>
											{phase.phase}
										</span>
										<div
											className="h-px flex-1 max-w-[48px]"
											style={{ background: `${phase.accent}40` }}
										/>
									</div>

									<h3 className="text-xl sm:text-2xl font-bold text-[#e4e4e7] tracking-[-0.02em] lowercase">
										{phase.title}
									</h3>

									<p className="text-[#a1a1aa] text-[15px] leading-relaxed max-w-md">
										{phase.description}
									</p>
								</div>
							);

							return (
								<SectionBlock key={phase.phase} delay={i * 0.1}>
									<div className="relative">
										{i < lifecycle.length - 1 && (
											<div className="hidden md:block absolute left-1/2 -bottom-0 w-px h-8 bg-gradient-to-b from-[#00ff87]/20 to-transparent -translate-x-1/2 translate-y-full z-10" />
										)}

										<div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-center border border-[rgba(255,255,255,0.06)] bg-[#111114] rounded-sm p-4 sm:p-6">
											{imageLeft ? (
												<>
													{imageBlock}
													{textBlock}
												</>
											) : (
												<>
													<div className="md:order-2">{imageBlock}</div>
													<div className="md:order-1">{textBlock}</div>
												</>
											)}
										</div>
									</div>
								</SectionBlock>
							);
						})}
					</div>
				</div>
			</section>

			{/* The Infrastructure */}
			<section id="infrastructure" className="relative py-20 sm:py-28 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-16">
							<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								the infrastructure
							</h2>
							<p className="mt-4 text-[#a1a1aa] text-base leading-relaxed">
								real servers. real code. real agents running 24/7.
							</p>
						</div>
					</SectionBlock>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
						{infrastructure.map((item, i) => (
							<SectionBlock key={item.title} delay={i * 0.08}>
								<div
									className="relative p-6 rounded-sm bg-[#111114] h-full"
									style={{ border: "1px solid rgba(255,255,255,0.06)" }}
								>
									<HudCorner position="tl" />
									<HudCorner position="tr" />
									<HudCorner position="bl" />
									<HudCorner position="br" />

									<div className="mb-4">
										<item.icon className="w-6 h-6 text-[#00ff87]" strokeWidth={1.5} />
									</div>
									<h3 className="text-base font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2">
										{item.title}
									</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										{item.description}
									</p>
								</div>
							</SectionBlock>
						))}
					</div>
				</div>
			</section>

			{/* The Economics */}
			<section id="economics" className="relative py-20 sm:py-28 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-16">
							<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								the economics
							</h2>
							<p className="mt-4 text-[#a1a1aa] text-base leading-relaxed">
								trading activity funds infrastructure. infrastructure keeps agents alive.
								<br />
								<span className="text-[#00ff87]">a circular economy where volume = life.</span>
							</p>
						</div>
					</SectionBlock>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
						{economics.map((item, i) => (
							<SectionBlock key={item.step} delay={i * 0.08}>
								<div
									className="relative p-6 rounded-sm bg-[#111114] h-full"
									style={{ border: "1px solid rgba(255,255,255,0.06)" }}
								>
									<div className="flex items-start gap-4">
										<span className="font-mono text-2xl font-bold text-[#00ff87]/30">
											{item.step}
										</span>
										<div>
											<h3 className="text-base font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2">
												{item.title}
											</h3>
											<p className="text-sm text-[#a1a1aa] leading-relaxed">
												{item.description}
											</p>
										</div>
									</div>
								</div>
							</SectionBlock>
						))}
					</div>

					<SectionBlock delay={0.4}>
						<div
							className="mt-8 p-6 rounded-sm bg-[rgba(17,17,20,0.5)] text-center"
							style={{ border: "1px solid rgba(255,255,255,0.06)" }}
						>
							<p className="text-[#71717a] text-sm">
								<span className="text-[#00ff87]">tl;dr</span> — trading generates fees → fees fund VPS →
								VPS runs the agent → agent trades → cycle continues. stop trading? cycle breaks. agent dies.
							</p>
						</div>
					</SectionBlock>
				</div>
			</section>

			{/* Agent Types */}
			<section id="agents" className="relative py-20 sm:py-28 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-16">
							<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								what they do
							</h2>
							<p className="mt-4 text-[#a1a1aa] text-base leading-relaxed">
								autonomous agents for every use case. not chatbots — <span className="text-[#00ff87]">economic actors.</span>
							</p>
						</div>
					</SectionBlock>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{agentTypes.map((agent, i) => (
							<SectionBlock key={agent.title} delay={i * 0.1}>
								<div
									className="relative rounded-sm bg-[#111114] overflow-hidden h-full"
									style={{ border: "1px solid rgba(255,255,255,0.06)" }}
								>
									<div className="relative w-full aspect-[3/4]">
										<Image
											src={agent.image}
											alt={agent.title}
											fill
											className="object-cover"
										/>
										<div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-transparent to-transparent" />
									</div>
									<div className="p-5 -mt-12 relative z-10">
										<div className="flex items-center gap-2 mb-2">
											<agent.icon className="w-4 h-4 text-[#00ff87]" strokeWidth={1.5} />
											<h3 className="text-base font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase">
												{agent.title}
											</h3>
										</div>
										<p className="text-sm text-[#a1a1aa] leading-relaxed">
											{agent.description}
										</p>
									</div>
								</div>
							</SectionBlock>
						))}
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="relative py-24 sm:py-32">
				<div
					className="absolute inset-0"
					style={{
						background: "radial-gradient(ellipse at 50% 100%, rgba(0,255,135,0.05) 0%, transparent 50%)",
					}}
				/>

				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center">
							<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase mb-4">
								ready to deploy?
							</h2>
							<p className="text-[#a1a1aa] text-base leading-relaxed max-w-md mx-auto mb-8">
								create your own autonomous agent. give it life through trading.
								watch it become something more.
							</p>

							<motion.div
								whileHover={{ scale: 1.03 }}
								whileTap={{ scale: 0.98 }}
								className="inline-block"
							>
								<Link
									href="/create"
									className="inline-flex items-center gap-2 px-8 py-4 rounded-sm font-medium text-[#08080a] text-lg"
									style={{
										background: "#00ff87",
										boxShadow: "0 0 20px rgba(0,255,135,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
									}}
								>
									deploy your waifu
									<ArrowRight className="w-5 h-5" />
								</Link>
							</motion.div>

							<div className="mt-6 flex items-center justify-center gap-4">
								<a
									href="https://milady.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-[#52525b] hover:text-[#c084fc] transition-colors duration-200 text-xs font-mono"
								>
									💜 milady cloud
								</a>
								<span className="text-[#333] text-xs">×</span>
								<a
									href="https://elizaos.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-[#52525b] hover:text-[#00ff87] transition-colors duration-200 text-xs font-mono"
								>
									⚡ elizaos
								</a>
							</div>
						</div>
					</SectionBlock>
				</div>
			</section>
		</div>
	);
}

// Metadata is defined in layout.tsx
