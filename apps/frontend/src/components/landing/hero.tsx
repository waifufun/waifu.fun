"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useTranslation } from "@/contexts/locale-context";

export default function Hero() {
	const { t } = useTranslation();

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.08,
				delayChildren: 0.1,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 24 },
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				type: "spring" as const,
				stiffness: 140,
				damping: 22,
			},
		},
	};

	const bgDark = "#08080a";

	return (
		<section
			className="relative overflow-hidden flex items-center min-h-[clamp(340px,42vh,460px)] py-10 lg:py-12 isolate"
			style={{ backgroundColor: bgDark, transform: "translateZ(0)" }}
		>
			{/* Base layer: solid dark prevents white flash */}
			<div className="absolute inset-0 z-0" style={{ backgroundColor: bgDark }} aria-hidden />

			{/* Hero background image */}
			<div className="absolute inset-0 z-0">
				<picture>
					<source srcSet="/brand/backgrounds/hero-bg.webp" type="image/webp" />
					<img
						src="/brand/backgrounds/hero-bg.jpg"
						alt=""
						aria-hidden="true"
						className="absolute inset-0 h-full w-full object-cover object-center opacity-30"
						loading="eager"
					/>
				</picture>
			</div>

			{/* Single gradient overlay: vertical dark fade */}
			<div
				className="absolute inset-0 z-[1]"
				style={{
					background: `linear-gradient(180deg, transparent 0%, ${bgDark} 100%)`,
				}}
			/>

			{/* Content */}
			<motion.div
				className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				<div className="flex flex-col">
					{/* Brand lockup */}
					<motion.div variants={itemVariants} className="mb-4 w-fit">
						<Image
							src="/brand/lockup/lockup_waifufun_512.png"
							alt="waifu.fun"
							width={200}
							height={94}
							priority
							className="h-auto w-[160px] sm:w-[180px] lg:w-[200px] object-contain"
							unoptimized
						/>
					</motion.div>

					{/* Headline */}
					<motion.div variants={itemVariants}>
						<h1 className="text-[clamp(2.4rem,5vw,4rem)] font-bold tracking-[-0.04em] leading-[0.98]">
							<span className="block text-[#f4f4f5]">{t("hero.autonomous")}</span>
							<span className="block text-[#e4e4e7]">{t("hero.agentsThat")}</span>
							<span className="block text-[#00ff87] drop-shadow-[0_0_24px_rgba(0,255,135,0.16)]">{t("hero.buildWealth")}</span>
						</h1>
					</motion.div>

					{/* Subtitle - single line only */}
					<motion.div variants={itemVariants} className="mt-4 max-w-lg">
						<p className="text-lg text-[#f4f4f5] font-medium leading-relaxed">
							{t("hero.notChatbots")} <span className="text-[#a1a1aa]">{t("hero.economicActors")}</span>
						</p>
					</motion.div>

					{/* CTA Buttons */}
					<motion.div variants={itemVariants} className="mt-6 flex flex-wrap gap-3">
						<motion.a
							href="/create"
							className="inline-flex items-center gap-2 px-7 py-3 rounded-sm font-medium text-[#08080a] relative overflow-hidden"
							style={{
								background: "#00ff87",
								boxShadow: "0 0 20px rgba(0,255,135,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
							}}
							whileHover={{
								scale: 1.03,
								boxShadow: "0 0 30px rgba(0,255,135,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
							}}
							whileTap={{ scale: 0.98 }}
							transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
						>
							{t("hero.deployAgent")}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<title>Deploy</title>
								<line x1="5" y1="12" x2="19" y2="12" />
								<polyline points="12 5 19 12 12 19" />
							</svg>
						</motion.a>
						<motion.a
							href="#explore"
							className="inline-flex items-center px-7 py-3 rounded-sm border border-[rgba(255,255,255,0.08)] text-[#71717a] font-medium bg-[rgba(17,17,20,0.4)]"
							whileHover={{
								scale: 1.03,
								borderColor: "rgba(0,255,135,0.25)",
								color: "#e4e4e7",
							}}
							whileTap={{ scale: 0.98 }}
							transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
						>
							{t("hero.exploreAgents")}
						</motion.a>
					</motion.div>

					{/* Partner rail */}
					<motion.div
						variants={itemVariants}
						className="mt-5 flex w-fit items-center gap-3 border-t border-[rgba(255,255,255,0.08)] pt-3 text-[11px] font-mono uppercase tracking-[0.2em] text-[#71717a]"
					>
						<span className="text-[#8f8f97]">powered by</span>
						<a
							href="https://milady.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center text-[#8f8f97] transition-colors duration-200 hover:text-[#c084fc]"
						>
							Milady Cloud
						</a>
						<span className="text-[#3f3f46]">/</span>
						<a
							href="https://elizaos.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center text-[#8f8f97] transition-colors duration-200 hover:text-[#00ff87]"
						>
							ElizaOS
						</a>
					</motion.div>
				</div>
			</motion.div>
		</section>
	);
}
