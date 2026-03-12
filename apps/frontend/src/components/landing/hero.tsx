"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/contexts/locale-context";

const GlitchBg = dynamic(() => import("./glitch-bg"), { ssr: false });

const EASE = [0.22, 1, 0.36, 1] as const;

function RevealLine({
	children,
	delay = 0,
	className = "",
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	return (
		<div className={`overflow-hidden ${className}`}>
			<motion.div
				initial={{ y: "110%" }}
				animate={{ y: "0%" }}
				transition={{ duration: 0.8, ease: EASE, delay }}
			>
				{children}
			</motion.div>
		</div>
	);
}

function MagneticButton({
	href,
	children,
	variant = "primary",
}: {
	href: string;
	children: React.ReactNode;
	variant?: "primary" | "ghost";
}) {
	const ref = useRef<HTMLAnchorElement>(null);
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const springX = useSpring(x, { stiffness: 250, damping: 20 });
	const springY = useSpring(y, { stiffness: 250, damping: 20 });

	const handleMouse = (e: React.MouseEvent) => {
		const el = ref.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		x.set((e.clientX - (rect.left + rect.width / 2)) * 0.15);
		y.set((e.clientY - (rect.top + rect.height / 2)) * 0.15);
	};

	const reset = () => {
		x.set(0);
		y.set(0);
	};

	const isPrimary = variant === "primary";

	return (
		<motion.a
			ref={ref}
			href={href}
			onMouseMove={handleMouse}
			onMouseLeave={reset}
			style={{ x: springX, y: springY }}
			className={
				isPrimary
					? "inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium tracking-wide uppercase text-[#08080a] bg-[#00ff87] rounded-none"
					: "inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium tracking-wide uppercase text-[#71717a] border border-[rgba(255,255,255,0.08)] rounded-none hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.16)] transition-colors duration-300"
			}
			whileTap={{ scale: 0.97 }}
		>
			{children}
		</motion.a>
	);
}

export default function Hero() {
	const { t } = useTranslation();

	return (
		<section
			className="relative flex flex-col items-center justify-center min-h-[100svh] overflow-hidden isolate select-none"
			style={{ backgroundColor: "#08080a" }}
		>
			{/* Glitch character background */}
			<div className="absolute inset-0 z-0 opacity-40">
				<GlitchBg
					glitchColors={["#0a1a12", "#00ff87", "#0d2818", "#061a0e"]}
					glitchSpeed={60}
					smooth
					characters="アイウエオカキクケコサシスセソタチツテトワヲン♀♂∞§¶×÷01"
				/>
			</div>

			{/* Hero background image — low opacity, adds depth */}
			<div className="absolute inset-0 z-[1]">
				<picture>
					<source srcSet="/brand/backgrounds/hero-bg.webp" type="image/webp" />
					<img
						src="/brand/backgrounds/hero-bg.jpg"
						alt=""
						aria-hidden="true"
						className="absolute inset-0 h-full w-full object-cover object-center opacity-15 mix-blend-screen"
						loading="eager"
					/>
				</picture>
			</div>

			{/* Dark overlay for text contrast */}
			<div
				className="absolute inset-0 z-[2]"
				style={{
					background:
						"radial-gradient(ellipse 70% 60% at 50% 50%, rgba(8,8,10,0.4), rgba(8,8,10,0.85) 100%)",
				}}
			/>

			{/* Content */}
			<div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl mx-auto">
				{/* Brand lockup */}
				<motion.div
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.6, ease: EASE }}
					className="mb-12"
				>
					<Image
						src="/brand/lockup/lockup_waifufun_512.png"
						alt="waifu.fun"
						width={140}
						height={66}
						priority
						className="h-auto w-[120px] sm:w-[140px] object-contain opacity-50"
						unoptimized
					/>
				</motion.div>

				{/* Headline — consistent sizing, punchy copy */}
				<div className="flex flex-col items-center gap-2">
					<RevealLine delay={0.15}>
						<h1 className="text-[clamp(2.4rem,6vw,5.5rem)] font-bold tracking-[-0.04em] leading-[1.05] text-[#f4f4f5]">
							{t("hero.theyLive")}{" "}
							<span className="text-[#a1a1aa] font-light">{t("hero.ifYouTrade")}</span>
						</h1>
					</RevealLine>

					<RevealLine delay={0.3}>
						<h1 className="text-[clamp(2.4rem,6vw,5.5rem)] font-bold tracking-[-0.04em] leading-[1.05] text-[#f4f4f5]">
							{t("hero.theyDie")}{" "}
							<span className="text-[#a1a1aa] font-light">{t("hero.ifYouDont")}</span>
						</h1>
					</RevealLine>
				</div>

				{/* Subtitle */}
				<motion.p
					className="mt-8 text-lg text-[#71717a] max-w-md leading-relaxed"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
				>
					{t("hero.notChatbots")} <span className="text-[#a1a1aa]">{t("hero.economicActors")}</span>
				</motion.p>

				{/* CTAs */}
				<motion.div
					className="mt-8 flex flex-col sm:flex-row items-center gap-3"
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.75, ease: EASE }}
				>
					<MagneticButton href="/create" variant="primary">
						{t("hero.deployAgent")}
					</MagneticButton>
					<MagneticButton href="#explore" variant="ghost">
						{t("hero.exploreAgents")}
					</MagneticButton>
				</motion.div>

				{/* Partner rail */}
				<motion.div
					className="mt-8 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-[#3f3f46]"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.8, delay: 1.0 }}
				>
					<a
						href="https://milady.ai"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors duration-200 hover:text-[#71717a]"
					>
						Milady
					</a>
					<span>×</span>
					<a
						href="https://elizaos.ai"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors duration-200 hover:text-[#71717a]"
					>
						ElizaOS
					</a>
				</motion.div>
			</div>

			{/* Scroll indicator */}
			<motion.div
				className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 1.3, duration: 0.6 }}
			>
				<motion.div
					className="w-px h-8 bg-gradient-to-b from-transparent to-[rgba(255,255,255,0.15)]"
					animate={{ scaleY: [0.5, 1, 0.5] }}
					transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
				/>
			</motion.div>
		</section>
	);
}
