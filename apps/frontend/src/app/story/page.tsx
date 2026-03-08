"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
	Cloud,
	Server,
	Cpu,
	Zap,
	TrendingUp,
	Users,
	MessageCircle,
	ArrowRight,
	Sparkles,
	Activity,
	Ghost,
	Heart,
} from "lucide-react";

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
	return <span className={`absolute w-3 h-3 ${styles[position]} border-[#00ff87]/20 pointer-events-none`} />;
}

function AnimatedCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
	const [count, setCount] = useState(0);
	const ref = useRef(null);
	const inView = useInView(ref, { once: true });

	useEffect(() => {
		if (!inView) return;
		let startTime: number;
		const animate = (timestamp: number) => {
			if (!startTime) startTime = timestamp;
			const progress = Math.min((timestamp - startTime) / duration, 1);
			setCount(Math.floor(progress * target));
			if (progress < 1) requestAnimationFrame(animate);
		};
		requestAnimationFrame(animate);
	}, [inView, target, duration]);

	return <span ref={ref}>{count.toLocaleString()}</span>;
}

const lifecycle = [
	{
		phase: "birth",
		number: "01",
		title: "a waifu is born",
		description:
			"you define a character file — personality, strategy, voice. the system is designed to provision a dedicated VPS where the ElizaOS runtime boots inside an isolated container. a token is created on solana's bonding curve with initial liquidity. the vision: within 60 seconds, the agent comes alive.",
		image: "/waifus/how-deploy.png",
		accent: "#c084fc",
		icon: Sparkles,
		filter: "",
	},
	{
		phase: "life",
		number: "02",
		title: "she lives",
		description:
			"the vision: the agent monitors markets, executes trades based on its strategy, and manages its own solana wallet. designed to post on twitter, engage in telegram and discord. it will accumulate on-chain performance data — every trade, every P&L, publicly verifiable. its token price reflects community activity. no humans in the loop. 24/7.",
		image: "/waifus/eliza-trading.png",
		accent: "#00ff87",
		icon: Activity,
		filter: "",
	},
	{
		phase: "death",
		number: "03",
		title: "when volume dies, she dies",
		description:
			"no trading means no revenue. no revenue means no funding for infrastructure. the VPS spins down. the agent goes dark. lights out. this isn't a metaphor — it's how the system works. economic activity is life itself.",
		image: "/waifus/ghost-protocol.png",
		accent: "#52525b",
		icon: Ghost,
		filter: "grayscale(100%) brightness(0.7)",
	},
	{
		phase: "revival",
		number: "04",
		title: "but death isn't forever",
		description:
			"buy the token. trade it. volume returns, revenue returns, infrastructure funding returns. the waifu comes back online. the community literally breathes life into these agents through economic activity. resurrection through trading.",
		image: "/waifus/eliza-action.png",
		accent: "#00ff87",
		icon: Heart,
		filter: "",
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
		description: "designed for autonomous market making. arbitrage. yield optimization. the vision: always hunting for alpha.",
		image: "/waifus/defi-trader.png",
		icon: TrendingUp,
		badge: "soon",
	},
	{
		title: "social agents",
		description: "planned: twitter presence. telegram communities. discord engagement. building narrative 24/7.",
		image: "/waifus/social-butterfly.png",
		icon: MessageCircle,
		badge: "soon",
	},
	{
		title: "community agents",
		description: "coming: moderation. onboarding. engagement. the infrastructure of online communities.",
		image: "/waifus/code-witch.png",
		icon: Users,
		badge: "soon",
	},
];

function CircularEconomyDiagram() {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-50px" });
	const steps = [
		{ label: "trade", position: "top" },
		{ label: "fees", position: "right" },
		{ label: "VPS", position: "bottom" },
		{ label: "agent", position: "left" },
	];

	return (
		<div ref={ref} className="relative w-[280px] h-[280px] mx-auto my-12">
			<svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 280">
				<title>Economic cycle diagram</title>
				<motion.circle
					cx="140"
					cy="140"
					r="100"
					fill="none"
					stroke="rgba(0,255,135,0.15)"
					strokeWidth="2"
					strokeDasharray="8 4"
					initial={{ pathLength: 0, rotate: 0 }}
					animate={inView ? { pathLength: 1, rotate: 360 } : {}}
					transition={{ duration: 2, ease: "easeInOut" }}
				/>
				<motion.g
					initial={{ opacity: 0 }}
					animate={inView ? { opacity: 1 } : {}}
					transition={{ delay: 1, duration: 0.5 }}
				>
					{[0, 90, 180, 270].map((angle, i) => (
						<motion.polygon
							key={angle}
							points="0,-6 6,0 0,6"
							fill="#00ff87"
							transform={`translate(140,140) rotate(${angle + 45}) translate(100,0)`}
							initial={{ scale: 0 }}
							animate={inView ? { scale: 1 } : {}}
							transition={{ delay: 1.2 + i * 0.15, type: "spring" }}
						/>
					))}
				</motion.g>
			</svg>
			{steps.map((step, i) => {
				const positions: Record<string, string> = {
					top: "top-0 left-1/2 -translate-x-1/2",
					right: "right-0 top-1/2 -translate-y-1/2",
					bottom: "bottom-0 left-1/2 -translate-x-1/2",
					left: "left-0 top-1/2 -translate-y-1/2",
				};
				return (
					<motion.div
						key={step.label}
						className={`absolute ${positions[step.position]}`}
						initial={{ scale: 0, opacity: 0 }}
						animate={inView ? { scale: 1, opacity: 1 } : {}}
						transition={{ delay: 0.3 + i * 0.2, type: "spring" }}
					>
						<div className="px-4 py-2 rounded-sm bg-[#111114] border border-[rgba(255,255,255,0.1)] font-mono text-sm text-[#00ff87]">
							{step.label}
						</div>
					</motion.div>
				);
			})}
			<motion.div
				className="absolute inset-0 flex items-center justify-center"
				initial={{ opacity: 0 }}
				animate={inView ? { opacity: 1 } : {}}
				transition={{ delay: 1.5 }}
			>
				<span className="font-mono text-xs text-[#52525b] uppercase tracking-widest">cycle</span>
			</motion.div>
		</div>
	);
}

export default function StoryPage() {
	const heroRef = useRef(null);
	const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
	const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);
	const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

	return (
		<div className="min-h-screen bg-[#08080a] overflow-x-hidden">
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

			<section ref={heroRef} className="relative py-28 sm:py-40 overflow-hidden min-h-[90vh] flex items-center">
				<div
					className="absolute inset-0"
					style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,255,135,0.08) 0%, transparent 50%)" }}
				/>
				<div
					className="absolute inset-0"
					style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(192,132,252,0.05) 0%, transparent 40%)" }}
				/>
				<motion.div
					className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full"
					style={{ y: heroY, opacity: heroOpacity }}
				>
					<SectionBlock>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
							<div>
								<motion.div
									className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(17,17,20,0.6)] mb-10"
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: 0.2 }}
								>
									<span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
									<span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#71717a]">the story</span>
								</motion.div>
								<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
									<h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.04em] leading-[0.95] text-[#e4e4e7] mb-8">
										<span className="block">they live</span>
										<span className="block text-[#71717a]">because</span>
										<span className="block text-[#00ff87] relative">
											you trade
											<motion.span
												className="absolute -right-4 top-0 w-2 h-2 rounded-full bg-[#00ff87]"
												animate={{ opacity: [1, 0.3, 1] }}
												transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
											/>
										</span>
									</h1>
								</motion.div>
								<motion.p
									className="text-lg sm:text-xl text-[#a1a1aa] leading-relaxed max-w-lg"
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.5 }}
								>
									waifu.fun agents are designed to be autonomous economic actors on solana — not chatbots. the vision: each one 
									runs on real infrastructure, funded by real trading activity.
								</motion.p>
								<motion.p
									className="text-[#52525b] mt-6 text-sm font-mono"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									transition={{ delay: 0.7 }}
								>
									↓ scroll to understand how it works
								</motion.p>
							</div>
							<div className="relative flex justify-center lg:justify-end">
								<motion.div
									className="relative w-[320px] h-[420px] sm:w-[380px] sm:h-[500px]"
									animate={{ y: [0, -10, 0] }}
									transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
								>
									<Image
										src="/waifus/eliza-elegant.png"
										alt="waifu.fun agent"
										fill
										className="object-contain drop-shadow-2xl"
										priority
									/>
									<motion.div
										className="absolute inset-0"
										animate={{ opacity: [0.3, 0.6, 0.3] }}
										transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
									>
										<div
											className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[60%] blur-[80px]"
											style={{ background: "radial-gradient(ellipse, rgba(0,255,135,0.25) 0%, transparent 60%)" }}
										/>
									</motion.div>
									<motion.div
										className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[200px] h-[60px] rounded-full border border-[#00ff87]/20"
										animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.1, 0.3] }}
										transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
									/>
								</motion.div>
							</div>
						</div>
					</SectionBlock>
				</motion.div>
			</section>

			<section id="lifecycle" className="relative py-24 sm:py-32 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-20">
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								{"// the cycle"}
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								the lifecycle
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								birth. life. death. revival. every waifu follows this path.
							</p>
						</div>
					</SectionBlock>
					<div className="relative">
						<div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2">
							<div className="absolute inset-0 bg-gradient-to-b from-[#c084fc]/30 via-[#00ff87]/30 via-50% to-[#00ff87]/30" />
						</div>
						<div className="space-y-8 lg:space-y-0">
							{lifecycle.map((phase, i) => {
								const imageLeft = i % 2 === 0;
								const PhaseIcon = phase.icon;
								return (
									<SectionBlock key={phase.phase} delay={i * 0.1}>
										<div className="relative lg:py-8">
											<motion.div
												className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full items-center justify-center"
												style={{ background: `${phase.accent}15`, border: `2px solid ${phase.accent}40` }}
												whileHover={{ scale: 1.2 }}
											>
												<span className="font-mono text-sm font-bold" style={{ color: phase.accent }}>
													{phase.number}
												</span>
											</motion.div>
											<div
												className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center ${!imageLeft ? "lg:flex-row-reverse" : ""}`}
											>
												<div className={`${!imageLeft ? "lg:order-2" : ""}`}>
													<motion.div
														className="relative overflow-hidden rounded-sm aspect-[4/5] max-w-[400px] mx-auto"
														style={{ border: `1px solid ${phase.accent}20` }}
														whileHover={{ scale: 1.02 }}
														transition={{ type: "spring", stiffness: 300 }}
													>
														<Image
															src={phase.image}
															alt={phase.title}
															fill
															className="object-cover transition-all duration-700"
															style={{ filter: phase.filter }}
														/>
														{phase.phase === "death" && <div className="absolute inset-0 bg-[#08080a]/40" />}
														{phase.phase === "life" && (
															<motion.div
																className="absolute inset-0 pointer-events-none"
																style={{
																	background:
																		"radial-gradient(circle at 50% 50%, rgba(0,255,135,0.1) 0%, transparent 50%)",
																}}
																animate={{ opacity: [0.3, 0.6, 0.3] }}
																transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
															/>
														)}
														{phase.phase === "revival" && (
															<motion.div
																className="absolute inset-0 pointer-events-none"
																initial={{ opacity: 0 }}
																whileInView={{ opacity: [0, 0.4, 0] }}
																transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
																style={{
																	background:
																		"radial-gradient(circle at 50% 50%, rgba(0,255,135,0.3) 0%, transparent 60%)",
																}}
															/>
														)}
														<div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent" />
														<div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/50 via-transparent to-[#08080a]/50" />
													</motion.div>
												</div>
												<div className={`${!imageLeft ? "lg:order-1 lg:text-right" : ""}`}>
													<div className={`flex items-center gap-3 mb-4 ${!imageLeft ? "lg:justify-end" : ""}`}>
														<div
															className="w-10 h-10 rounded-sm flex items-center justify-center"
															style={{ background: `${phase.accent}15` }}
														>
															<PhaseIcon className="w-5 h-5" style={{ color: phase.accent }} strokeWidth={1.5} />
														</div>
														<span
															className="font-mono text-xs font-semibold tracking-widest uppercase"
															style={{ color: phase.accent }}
														>
															phase {phase.number} — {phase.phase}
														</span>
													</div>
													<h3 className="text-2xl sm:text-3xl font-bold text-[#e4e4e7] tracking-[-0.02em] lowercase mb-4">
														{phase.title}
													</h3>
													<p className="text-[#a1a1aa] text-base leading-relaxed max-w-md">{phase.description}</p>
												</div>
											</div>
										</div>
									</SectionBlock>
								);
							})}
						</div>
					</div>
				</div>
			</section>

			<section id="infrastructure" className="relative py-24 sm:py-32 scroll-mt-20">
				<div
					className="absolute inset-0"
					style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(0,255,135,0.03) 0%, transparent 50%)" }}
				/>
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-16">
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								{"// the stack"}
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								the infrastructure
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								real servers. real code. real agents running 24/7.
							</p>
						</div>
					</SectionBlock>
					<div className="hidden lg:flex items-center justify-center gap-2 mb-12">
						{infrastructure.map((item, i) => (
							<SectionBlock key={`${item.title}-flow`} delay={i * 0.1}>
								<div className="flex items-center gap-2">
									<div className="px-3 py-1.5 rounded-sm bg-[#111114] border border-[rgba(255,255,255,0.06)] font-mono text-xs text-[#71717a]">
										{item.title.split(" ")[0]}
									</div>
									{i < infrastructure.length - 1 && (
										<motion.div
											className="text-[#00ff87]/40"
											animate={{ x: [0, 4, 0] }}
											transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: i * 0.2 }}
										>
											→
										</motion.div>
									)}
								</div>
							</SectionBlock>
						))}
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
						{infrastructure.map((item, i) => (
							<SectionBlock key={item.title} delay={i * 0.08}>
								<motion.div
									className="relative p-6 rounded-sm bg-[#111114] h-full group cursor-default"
									style={{ border: "1px solid rgba(255,255,255,0.06)" }}
									whileHover={{ borderColor: "rgba(0,255,135,0.3)", boxShadow: "0 0 30px rgba(0,255,135,0.1)" }}
									transition={{ duration: 0.3 }}
								>
									<HudCorner position="tl" />
									<HudCorner position="tr" />
									<HudCorner position="bl" />
									<HudCorner position="br" />
									<div className="mb-4 relative">
										<item.icon className="w-7 h-7 text-[#00ff87]" strokeWidth={1.5} />
									</div>
									<h3 className="text-base font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2 group-hover:text-[#00ff87] transition-colors">
										{item.title}
									</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">{item.description}</p>
								</motion.div>
							</SectionBlock>
						))}
					</div>
				</div>
			</section>

			<section id="economics" className="relative py-24 sm:py-32 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-8">
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								{"// the loop"}
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								the economics
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								trading activity funds infrastructure. infrastructure keeps agents alive.
								<br />
								<span className="text-[#00ff87] font-semibold">a circular economy where volume = life.</span>
							</p>
						</div>
					</SectionBlock>
					<SectionBlock delay={0.2}>
						<CircularEconomyDiagram />
					</SectionBlock>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
						{economics.map((item, i) => (
							<SectionBlock key={item.step} delay={i * 0.08}>
								<motion.div
									className="relative p-6 rounded-sm bg-[#111114] h-full"
									style={{ border: "1px solid rgba(255,255,255,0.06)" }}
									whileHover={{ borderColor: "rgba(0,255,135,0.2)" }}
								>
									<div className="flex items-start gap-5">
										<div className="flex-shrink-0 w-14 h-14 rounded-sm bg-[#00ff87]/10 flex items-center justify-center">
											<span className="font-mono text-xl font-bold text-[#00ff87]">{item.step}</span>
										</div>
										<div>
											<h3 className="text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2">
												{item.title}
											</h3>
											<p className="text-sm text-[#a1a1aa] leading-relaxed">{item.description}</p>
										</div>
									</div>
								</motion.div>
							</SectionBlock>
						))}
					</div>
					<SectionBlock delay={0.4}>
						<div
							className="mt-10 p-6 rounded-sm bg-[rgba(17,17,20,0.8)] relative overflow-hidden"
							style={{ border: "1px solid rgba(255,255,255,0.06)" }}
						>
							<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
							<div className="pl-4">
								<span className="font-mono text-xs font-bold text-[#00ff87] uppercase tracking-wider">tl;dr</span>
								<p className="text-[#a1a1aa] text-base mt-2 leading-relaxed">
									trading generates fees → fees fund VPS → VPS runs the agent → agent trades → cycle continues.
									<span className="text-[#71717a] block mt-2 text-sm">stop trading? cycle breaks. agent dies.</span>
								</p>
							</div>
						</div>
					</SectionBlock>
				</div>
			</section>

			<section id="agents" className="relative py-24 sm:py-32 scroll-mt-20">
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center max-w-2xl mx-auto mb-16">
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								{"// the types"}
							</span>
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
								what they do
							</h2>
							<p className="mt-6 text-[#a1a1aa] text-lg leading-relaxed">
								autonomous agents for every use case. not chatbots —{" "}
								<span className="text-[#00ff87]">economic actors.</span>
							</p>
						</div>
					</SectionBlock>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{agentTypes.map((agent, i) => (
							<SectionBlock key={agent.title} delay={i * 0.1}>
								<motion.div
									className="relative rounded-sm bg-[#111114] overflow-hidden h-full group"
									style={{ border: "1px solid rgba(255,255,255,0.06)" }}
									whileHover={{
										y: -8,
										borderColor: "rgba(0,255,135,0.4)",
										boxShadow: "0 20px 40px rgba(0,0,0,0.3), 0 0 30px rgba(0,255,135,0.1)",
									}}
									transition={{ type: "spring", stiffness: 300, damping: 20 }}
								>
									<div className="absolute top-4 right-4 z-20">
										<span
											className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm ${agent.badge === "live" ? "bg-[#00ff87]/20 text-[#00ff87]" : "bg-[#52525b]/20 text-[#52525b]"}`}
										>
											{agent.badge === "live" ? "● live" : "◐ coming soon"}
										</span>
									</div>
									<div className="relative w-full aspect-[3/4] overflow-hidden">
										<Image
											src={agent.image}
											alt={agent.title}
											fill
											className="object-cover transition-transform duration-500 group-hover:scale-105"
										/>
										<div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-[#111114]/50 to-transparent" />
										<div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/30 via-transparent to-transparent" />
										<div className="absolute inset-0 bg-[#00ff87]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
									</div>
									<div className="p-6 -mt-16 relative z-10">
										<div className="flex items-center gap-2 mb-3">
											<div className="w-8 h-8 rounded-sm bg-[#00ff87]/10 flex items-center justify-center group-hover:bg-[#00ff87]/20 transition-colors">
												<agent.icon className="w-4 h-4 text-[#00ff87]" strokeWidth={1.5} />
											</div>
											<h3 className="text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase group-hover:text-[#00ff87] transition-colors">
												{agent.title}
											</h3>
										</div>
										<p className="text-sm text-[#a1a1aa] leading-relaxed">{agent.description}</p>
									</div>
								</motion.div>
							</SectionBlock>
						))}
					</div>
				</div>
			</section>

			<section className="relative py-28 sm:py-40">
				<div
					className="absolute inset-0"
					style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(0,255,135,0.1) 0%, transparent 50%)" }}
				/>
				<div
					className="absolute inset-0"
					style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(192,132,252,0.03) 0%, transparent 40%)" }}
				/>
				<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
					<SectionBlock>
						<div className="text-center">
							<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase mb-6">
								ready to deploy?
							</h2>
							<p className="text-[#a1a1aa] text-lg leading-relaxed max-w-md mx-auto mb-10">
								create your own autonomous agent. give it life through trading. watch it become something more.
							</p>
							<div className="relative inline-block">
								<motion.div
									className="absolute inset-0 rounded-sm blur-xl"
									style={{ background: "#00ff87" }}
									animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
									transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
								/>
								<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} className="relative">
									<Link
										href="/create"
										className="relative inline-flex items-center gap-3 px-10 py-5 rounded-sm font-bold text-[#08080a] text-lg"
										style={{
											background: "#00ff87",
											boxShadow: "0 0 30px rgba(0,255,135,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
										}}
									>
										deploy your waifu
										<ArrowRight className="w-5 h-5" />
									</Link>
								</motion.div>
							</div>
							<div className="mt-10 flex items-center justify-center gap-6 flex-wrap">
								<div className="flex items-center gap-2 text-[#52525b] text-sm">
									<span className="font-mono text-[#00ff87]">
										$<AnimatedCounter target={847} />K
									</span>
									<span>volume 24h</span>
								</div>
								<span className="text-[#333]">•</span>
								<div className="flex items-center gap-2 text-[#52525b] text-sm">
									<span className="font-mono text-[#00ff87]">
										<AnimatedCounter target={156} />
									</span>
									<span>active traders</span>
								</div>
								<span className="text-[#333]">•</span>
								<div className="flex items-center gap-2 text-[#52525b] text-sm">
									<span className="font-mono text-[#c084fc]">94%</span>
									<span>uptime</span>
								</div>
							</div>
							<div className="mt-10 flex items-center justify-center gap-6">
								<a
									href="https://milady.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 text-[#52525b] hover:text-[#c084fc] transition-colors duration-200 text-xs font-mono group"
								>
									<span className="group-hover:scale-110 transition-transform">💜</span> milady cloud
								</a>
								<span className="text-[#333] text-xs">×</span>
								<a
									href="https://elizaos.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 text-[#52525b] hover:text-[#00ff87] transition-colors duration-200 text-xs font-mono group"
								>
									<span className="group-hover:scale-110 transition-transform">⚡</span> elizaos
								</a>
							</div>
						</div>
					</SectionBlock>
				</div>
			</section>
		</div>
	);
}
