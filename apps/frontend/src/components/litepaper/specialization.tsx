"use client";

import { useTranslation } from "@/contexts/locale-context";
import { motion, useInView } from "framer-motion";
import { BarChart3, BookOpen, Cpu, MessageCircle, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

function RevealBlock({
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
			initial={{ opacity: 0, y: 28 }}
			animate={inView ? { opacity: 1, y: 0 } : {}}
			transition={{ duration: 0.7, delay, ease: EASE_OUT_EXPO }}
		>
			{children}
		</motion.div>
	);
}

export default function Specialization() {
	const { t } = useTranslation();
	// what a developer can build on top of the economic layer. not platform features.
	const agentTypes = [
		{
			icon: TrendingUp,
			title: t("litepaper.specialization.card1Title"),
			body: t("litepaper.specialization.card1Body"),
			image: "/waifus/defi-trader.png",
			accent: "#00ff87",
		},
		{
			icon: BarChart3,
			title: t("litepaper.specialization.card2Title"),
			body: t("litepaper.specialization.card2Body"),
			image: "/litepaper/v2/specialization-predict.webp",
			accent: "#00ff87",
		},
		{
			icon: MessageCircle,
			title: t("litepaper.specialization.card3Title"),
			body: t("litepaper.specialization.card3Body"),
			image: "/waifus/social-butterfly.png",
			accent: "#00ff87",
		},
		{
			icon: BookOpen,
			title: t("litepaper.specialization.card4Title"),
			body: t("litepaper.specialization.card4Body"),
			image: "/waifus/code-witch.png",
			accent: "#00ff87",
		},
		{
			icon: Cpu,
			title: t("litepaper.specialization.card5Title"),
			body: t("litepaper.specialization.card5Body"),
			image: "/litepaper/v2/specialization-grid.webp",
			accent: "#00ff87",
		},
	];
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 60% 80%, rgba(0,255,135,0.04) 0%, transparent 45%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header, left aligned */}
				<RevealBlock>
					<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
						{t("litepaper.specialization.eyebrow")}
					</span>
					<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase max-w-xl">
						{t("litepaper.specialization.headlineLeft")}{" "}
						<span className="text-[#00ff87]">{t("litepaper.specialization.headlineRight")}</span>
					</h2>
				</RevealBlock>

				<RevealBlock delay={0.08}>
					<p className="mt-8 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						{t("litepaper.specialization.intro")}
					</p>
				</RevealBlock>

				{/* Agent type grid, clean 2-col top, 3-col bottom */}
				<div className="mt-16 space-y-4">
					{/* First row: 2 equal cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{agentTypes.slice(0, 2).map((agent, i) => {
							const Icon = agent.icon;
							return (
								<RevealBlock key={agent.title} delay={0.15 + i * 0.08}>
									<motion.div
										className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] overflow-hidden h-full group transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[rgba(0,255,135,0.15)]"
										whileHover={{ y: -2 }}
										transition={{
											type: "spring",
											stiffness: 400,
											damping: 25,
										}}
									>
										{/* Background image */}
										<div className="absolute inset-0">
											<Image
												src={agent.image}
												alt=""
												fill
												className="object-cover object-center opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-700"
												sizes="(min-width: 768px) 50vw, 100vw"
												aria-hidden="true"
											/>
											<div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-[#111114]/80 to-[#111114]/40" />
										</div>

										<div className="relative p-6 sm:p-7">
											<div className="flex items-center gap-3 mb-4">
												<div className="w-9 h-9 rounded-sm bg-[rgba(0,255,135,0.06)] border border-[rgba(0,255,135,0.08)] flex items-center justify-center">
													<Icon className="w-4 h-4 text-[#00ff87]" strokeWidth={1.5} />
												</div>
												<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
													{String(i + 1).padStart(2, "0")}
												</span>
											</div>
											<h3 className="font-satoshi text-xl font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-3 group-hover:text-[#00ff87] transition-colors duration-300">
												{agent.title}
											</h3>
											<p className="text-sm leading-6 text-[#a1a1aa] max-w-md">{agent.body}</p>
										</div>
									</motion.div>
								</RevealBlock>
							);
						})}
					</div>

					{/* Second row: 3 equal cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{agentTypes.slice(2).map((agent, i) => {
							const Icon = agent.icon;
							return (
								<RevealBlock key={agent.title} delay={0.3 + i * 0.08}>
									<motion.div
										className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] overflow-hidden h-full group transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[rgba(0,255,135,0.15)]"
										whileHover={{ y: -2 }}
										transition={{
											type: "spring",
											stiffness: 400,
											damping: 25,
										}}
									>
										{/* Background image */}
										<div className="absolute inset-0">
											<Image
												src={agent.image}
												alt=""
												fill
												className="object-cover object-center opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-700"
												sizes="(min-width: 768px) 33vw, 100vw"
												aria-hidden="true"
											/>
											<div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-[#111114]/80 to-[#111114]/40" />
										</div>

										<div className="relative p-6 sm:p-7">
											<div className="flex items-center gap-3 mb-4">
												<div className="w-9 h-9 rounded-sm bg-[rgba(0,255,135,0.06)] border border-[rgba(0,255,135,0.08)] flex items-center justify-center">
													<Icon className="w-4 h-4 text-[#00ff87]" strokeWidth={1.5} />
												</div>
												<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
													{String(i + 3).padStart(2, "0")}
												</span>
											</div>
											<h3 className="font-satoshi text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-3 group-hover:text-[#00ff87] transition-colors duration-300">
												{agent.title}
											</h3>
											<p className="text-sm leading-6 text-[#a1a1aa]">{agent.body}</p>
										</div>
									</motion.div>
								</RevealBlock>
							);
						})}
					</div>
				</div>

				{/* Callout */}
				<RevealBlock delay={0.5}>
					<div className="mt-10 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-6 sm:p-7 relative overflow-hidden">
						<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
						<div className="pl-4">
							<p className="text-[#a1a1aa] text-base leading-relaxed">{t("litepaper.specialization.calloutBody")}</p>
						</div>
					</div>
				</RevealBlock>
			</div>
		</section>
	);
}
