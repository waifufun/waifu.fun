"use client";

import { useTranslation } from "@/contexts/locale-context";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
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

export default function ClosingV2() {
	const { t } = useTranslation();
	return (
		<section className="relative py-32 sm:py-44 overflow-hidden">
			{/* Converging radials for closing energy */}
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 50% 100%, rgba(0,255,135,0.08) 0%, transparent 50%)",
				}}
			/>
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 50% 0%, rgba(0,255,135,0.02) 0%, transparent 40%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Asymmetric: wide left text, narrow right glow */}
				<div className="max-w-3xl">
					<RevealBlock>
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
							{t("litepaper.closing.eyebrow")}
						</span>
						<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.04em] text-[#e4e4e7] leading-[0.92] lowercase">
							{t("litepaper.closing.headlineLeft")}{" "}
							<span className="text-[#00ff87]">{t("litepaper.closing.headlineRight")}</span>
						</h2>
					</RevealBlock>

					<RevealBlock delay={0.1}>
						<p className="mt-8 text-[#a1a1aa] text-lg sm:text-xl leading-relaxed max-w-[52ch]">
							{t("litepaper.closing.para1")}
						</p>
					</RevealBlock>

					<RevealBlock delay={0.12}>
						<p className="mt-5 text-[#a1a1aa] text-lg sm:text-xl leading-relaxed max-w-[52ch]">
							{t("litepaper.closing.para2Prefix")}{" "}
							<Link href="/agent/0x15fc6086064afe50ccf4c70000c55cecb6e17777" className="text-[#00ff87] hover:underline">
								$WAIFU
							</Link>{" "}
							{t("litepaper.closing.para2Suffix")}
						</p>
					</RevealBlock>

					<RevealBlock delay={0.15}>
						<div className="mt-6 space-y-2">
							<p className="text-[#52525b] text-base leading-relaxed">{t("litepaper.closing.para3Top")}</p>
							<p className="text-[#a1a1aa] text-base leading-relaxed">{t("litepaper.closing.para3Bottom")}</p>
						</div>
					</RevealBlock>

					{/* CTA */}
					<RevealBlock delay={0.25}>
						<div className="mt-12 flex flex-wrap items-center gap-4">
							<motion.div
								whileHover={{ scale: 1.03 }}
								whileTap={{ scale: 0.98 }}
								transition={{ type: "spring", stiffness: 400, damping: 20 }}
							>
								<Link
									href="/agents"
									className="group relative inline-flex items-center gap-3 px-10 py-4 text-base font-medium tracking-wide uppercase text-[#08080a] bg-[#00ff87] rounded-sm transition-shadow duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_0_24px_rgba(0,255,135,0.2)]"
								>
									{t("litepaper.closing.ctaBuild")}
									<span className="flex items-center justify-center w-7 h-7 rounded-sm bg-[rgba(8,8,10,0.12)]">
										<ArrowRight className="w-4 h-4" strokeWidth={2} />
									</span>
								</Link>
							</motion.div>
							<span className="text-[#52525b] text-sm font-mono">{t("litepaper.closing.ctaTagline")}</span>
						</div>
					</RevealBlock>
				</div>

				{/* Psyop signal, subtle, hits different */}
				<RevealBlock delay={0.35}>
					<p className="mt-16 font-mono text-[11px] tracking-[0.15em] text-[#3f3f46] italic">
						{t("litepaper.closing.psyop")}
					</p>
				</RevealBlock>

				{/* Footer tagline */}
				<RevealBlock delay={0.4}>
					<div className="mt-12 pt-8 border-t border-[rgba(255,255,255,0.06)]">
						<div className="flex flex-wrap items-center gap-4 sm:gap-6">
							{[
								{ label: "Eliza Cloud", href: null as string | null },
								{ label: "Steward", href: null as string | null },
								{ label: "FLAP", href: "https://flap.sh" as string | null },
								{ label: "Hyperliquid", href: "https://hyperliquid.xyz" as string | null },
								{ label: "Li.Fi", href: "https://li.fi" as string | null },
								{ label: "pancakeswap", href: "https://pancakeswap.finance" as string | null },
								{ label: "bsc", href: "https://bscscan.com" as string | null },
							].map((item, i) => (
								<span key={item.label} className="flex items-center gap-4 sm:gap-6">
									{item.href ? (
										<a
											href={item.href}
											target="_blank"
											rel="noopener noreferrer"
											className="font-mono text-xs text-[#52525b] hover:text-[#a1a1aa] transition-colors duration-300"
										>
											{item.label}
										</a>
									) : (
										<span className="font-mono text-xs text-[#52525b]">{item.label}</span>
									)}
									{i < 3 && <span className="text-[#333] text-xs select-none">/</span>}
								</span>
							))}
						</div>
					</div>
				</RevealBlock>
			</div>
		</section>
	);
}
