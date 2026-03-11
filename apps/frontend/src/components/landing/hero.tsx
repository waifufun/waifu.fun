"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { IToken } from "@waifufun/types";
import { useTranslation } from "@/contexts/locale-context";

function formatMarketCap(mc: number): string {
	if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}m`;
	if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}k`;
	return `$${mc}`;
}

export default function Hero({ token }: { token: IToken | null }) {
	const { t } = useTranslation();

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.1,
				delayChildren: 0.15,
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
				stiffness: 120,
				damping: 20,
			},
		},
	};

	const bgDark = "#08080a";

	return (
		<section
			className="relative overflow-hidden flex items-center min-h-[clamp(620px,68vh,820px)] py-10 lg:py-14 isolate"
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
						className="absolute inset-0 h-full w-full object-cover object-center opacity-75"
						loading="eager"
					/>
				</picture>
			</div>

			{/* Atmosphere and readability overlays */}
			<div
				className="absolute inset-0 z-[1]"
				style={{
					background: [
						"radial-gradient(circle at 22% 44%, rgba(0,255,135,0.18), transparent 30%)",
						"radial-gradient(circle at 78% 38%, rgba(140,160,255,0.08), transparent 24%)",
						"linear-gradient(90deg, rgba(8,8,10,0.18) 0%, rgba(8,8,10,0.28) 32%, rgba(8,8,10,0.64) 100%)",
						"linear-gradient(180deg, rgba(8,8,10,0.1) 0%, rgba(8,8,10,0.02) 46%, rgba(8,8,10,0.72) 100%)",
					].join(", "),
				}}
			/>

			{/* Bottom gradient fade to page background */}
			<div
				className="absolute bottom-0 left-0 right-0 z-[2] h-48"
				style={{ background: `linear-gradient(to bottom, transparent, ${bgDark})` }}
			/>

			{/* Background elements */}
			<div className="absolute inset-0 z-[3]">
				<div
					className="absolute inset-0 opacity-70"
					style={{
						backgroundImage: [
							"repeating-linear-gradient(0deg, transparent, transparent 55px, rgba(255,255,255,0.018) 55px, rgba(255,255,255,0.018) 56px)",
							"repeating-linear-gradient(90deg, transparent, transparent 55px, rgba(255,255,255,0.018) 55px, rgba(255,255,255,0.018) 56px)",
							"linear-gradient(118deg, transparent 0%, transparent 44%, rgba(255,255,255,0.04) 44.2%, transparent 44.5%, transparent 100%)",
						].join(", "),
					}}
				/>
				<div
					className="absolute inset-y-0 left-0 w-[58%] opacity-80"
					style={{
						backgroundImage:
							"repeating-linear-gradient(118deg, transparent 0 18px, rgba(255,255,255,0.028) 18px 19px, transparent 19px 44px)",
						maskImage: "linear-gradient(90deg, rgba(0,0,0,0.8), rgba(0,0,0,0.08), transparent)",
						WebkitMaskImage: "linear-gradient(90deg, rgba(0,0,0,0.8), rgba(0,0,0,0.08), transparent)",
					}}
				/>
				<div
					className="absolute inset-0"
					style={{
						background: `radial-gradient(ellipse at 26% 46%, transparent 0%, transparent 42%, ${bgDark} 86%)`,
					}}
				/>
			</div>

			{/* Content */}
			<motion.div
				className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-8 items-center">
					{/* Left: Text content */}
					<div className="relative flex flex-col max-w-[38rem]">
						<div
							className="absolute -left-16 top-8 h-[22rem] w-[22rem] rounded-full blur-3xl"
							style={{ background: "radial-gradient(circle, rgba(0,255,135,0.16), transparent 68%)" }}
						/>
						<motion.div variants={itemVariants} className="relative mb-5 w-fit">
							<Image
								src="/brand/lockup/lockup_waifufun_512.png"
								alt="waifu.fun"
								width={260}
								height={123}
								priority
								className="h-auto w-[190px] sm:w-[230px] lg:w-[260px] object-contain"
								unoptimized
							/>
						</motion.div>
						{/* Headline */}
						<motion.div variants={itemVariants} className="relative">
							<h1 className="text-[clamp(2.9rem,6vw,5.2rem)] font-bold tracking-[-0.04em] leading-[0.98]">
								<span className="block text-[#f4f4f5]">{t("hero.autonomous")}</span>
								<span className="block text-[#e4e4e7]">{t("hero.agentsThat")}</span>
								<span className="block text-[#00ff87] drop-shadow-[0_0_24px_rgba(0,255,135,0.16)]">{t("hero.buildWealth")}</span>
							</h1>
						</motion.div>

						{/* Subtitle */}
						<motion.div variants={itemVariants} className="mt-5 max-w-lg">
							<p className="text-lg text-[#f4f4f5] font-medium leading-relaxed">
								{t("hero.notChatbots")} <span className="text-[#a1a1aa]">{t("hero.economicActors")}</span>
							</p>
							<p className="text-[15px] text-[#71717a] mt-2 leading-relaxed">
								{t("hero.poweredBySubtitle")}
							</p>
						</motion.div>

						{/* CTA Buttons */}
						<motion.div variants={itemVariants} className="mt-7 flex flex-wrap gap-3">
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

					{/* Right: Top token card */}
					{token && (
						<motion.div variants={itemVariants} className="relative flex justify-center lg:justify-end">
							<div
								className="absolute right-4 top-1/2 hidden h-[22rem] w-[22rem] -translate-y-1/2 rounded-full blur-3xl lg:block"
								style={{ background: "radial-gradient(circle, rgba(0,255,135,0.12), transparent 68%)" }}
							/>
							<Link
								href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
								className="group block w-full max-w-[320px] sm:max-w-[380px] lg:max-w-[440px]"
							>
								<motion.div
									className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,15,0.72)] backdrop-blur-sm"
									whileHover={{
										boxShadow: "0 0 56px rgba(0,255,135,0.14), 0 18px 56px rgba(0,0,0,0.46)",
										borderColor: "rgba(0,255,135,0.28)",
									}}
									transition={{ type: "spring", stiffness: 260, damping: 24 }}
								>
									<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.18)] to-transparent" />
									<div className="relative aspect-[4/5] w-full overflow-hidden" style={{ backgroundColor: bgDark }}>
										<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.08),transparent_36%)] z-[1] pointer-events-none" />
										<Image
											src={token.image}
											alt={token.name}
											fill
											className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
											sizes="(max-width: 1024px) 380px, 440px"
											priority
										/>
										<div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-transparent to-transparent" />
										<div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1">
											<span className="text-xl sm:text-2xl font-bold text-[#e4e4e7] truncate">{token.name}</span>
											<span className="text-sm font-mono text-[#00ff87]">
												${token.ticker} · {formatMarketCap(token.marketcap ?? 0)}
											</span>
										</div>
									</div>
								</motion.div>
							</Link>
						</motion.div>
					)}
				</div>
			</motion.div>
		</section>
	);
}
