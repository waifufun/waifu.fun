"use client";

import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import Image from "next/image";
import { useRef, useEffect } from "react";

/* ─── animation config ─── */
const LINE_STAGGER = 0.12;
const REVEAL_DURATION = 0.8;
const EASE = [0.22, 1, 0.36, 1] as const; // custom ease-out expo

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
				transition={{ duration: REVEAL_DURATION, ease: EASE, delay }}
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
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		x.set((e.clientX - cx) * 0.15);
		y.set((e.clientY - cy) * 0.15);
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
	const sectionRef = useRef<HTMLElement>(null);
	const mouseX = useMotionValue(0.5);
	const mouseY = useMotionValue(0.5);

	// subtle parallax on the gradient accent
	const gradX = useTransform(mouseX, [0, 1], ["42%", "58%"]);
	const gradY = useTransform(mouseY, [0, 1], ["30%", "50%"]);
	const springGradX = useSpring(gradX, { stiffness: 60, damping: 30 });
	const springGradY = useSpring(gradY, { stiffness: 60, damping: 30 });

	useEffect(() => {
		const handleMove = (e: MouseEvent) => {
			if (!sectionRef.current) return;
			const rect = sectionRef.current.getBoundingClientRect();
			mouseX.set((e.clientX - rect.left) / rect.width);
			mouseY.set((e.clientY - rect.top) / rect.height);
		};
		const el = sectionRef.current;
		el?.addEventListener("mousemove", handleMove);
		return () => el?.removeEventListener("mousemove", handleMove);
	}, [mouseX, mouseY]);

	return (
		<section
			ref={sectionRef}
			className="relative flex flex-col items-center justify-center min-h-[100svh] overflow-hidden isolate select-none"
			style={{ backgroundColor: "#08080a" }}
		>
			{/* Subtle cursor-reactive gradient accent */}
			<motion.div
				className="absolute inset-0 z-0 pointer-events-none"
				style={{
					background: useTransform(
						[springGradX, springGradY],
						([gx, gy]) =>
							`radial-gradient(ellipse 50% 40% at ${gx} ${gy}, rgba(0,255,135,0.04), transparent 70%)`
					),
				}}
			/>

			{/* Noise texture overlay */}
			<div
				className="absolute inset-0 z-[1] pointer-events-none opacity-[0.03]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
					backgroundRepeat: "repeat",
					backgroundSize: "128px 128px",
				}}
			/>

			{/* Content */}
			<div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl mx-auto">
				{/* Brand lockup — small, above headline */}
				<motion.div
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.6, ease: EASE }}
					className="mb-10"
				>
					<Image
						src="/brand/lockup/lockup_waifufun_512.png"
						alt="waifu.fun"
						width={140}
						height={66}
						priority
						className="h-auto w-[120px] sm:w-[140px] object-contain opacity-60"
						unoptimized
					/>
				</motion.div>

				{/* Headline — large, centered, punchy */}
				<div className="flex flex-col items-center gap-1">
					<RevealLine delay={0.2}>
						<h1 className="text-[clamp(2.8rem,8vw,7rem)] font-bold tracking-[-0.05em] leading-[0.92] text-[#f4f4f5]">
							they{" "}
							<span className="text-[#00ff87]">live</span>
						</h1>
					</RevealLine>

					<RevealLine delay={0.2 + LINE_STAGGER}>
						<p className="text-[clamp(1.1rem,2.4vw,1.8rem)] font-light tracking-[-0.01em] text-[#52525b]">
							if you trade.
						</p>
					</RevealLine>

					<div className="h-2 sm:h-3" />

					<RevealLine delay={0.2 + LINE_STAGGER * 2}>
						<h1 className="text-[clamp(2.8rem,8vw,7rem)] font-bold tracking-[-0.05em] leading-[0.92] text-[#f4f4f5]">
							they{" "}
							<span className="text-[#ef4444]">die</span>
						</h1>
					</RevealLine>

					<RevealLine delay={0.2 + LINE_STAGGER * 3}>
						<p className="text-[clamp(1.1rem,2.4vw,1.8rem)] font-light tracking-[-0.01em] text-[#52525b]">
							if you don&apos;t.
						</p>
					</RevealLine>
				</div>

				{/* Breathing line separator */}
				<motion.div
					className="mt-10 mb-8 h-px w-16 bg-[rgba(255,255,255,0.1)]"
					initial={{ scaleX: 0, opacity: 0 }}
					animate={{ scaleX: 1, opacity: 1 }}
					transition={{ duration: 1, delay: 0.8, ease: EASE }}
				/>

				{/* CTAs */}
				<motion.div
					className="flex flex-col sm:flex-row items-center gap-3"
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.9, ease: EASE }}
				>
					<MagneticButton href="/create" variant="primary">
						Deploy Agent
					</MagneticButton>
					<MagneticButton href="#explore" variant="ghost">
						Explore
					</MagneticButton>
				</motion.div>

				{/* Powered by — tiny, quiet */}
				<motion.div
					className="mt-8 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-[#3f3f46]"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.8, delay: 1.2 }}
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
				transition={{ delay: 1.5, duration: 0.6 }}
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
