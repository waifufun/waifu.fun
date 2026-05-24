"use client";

import { useTranslation } from "@/contexts/locale-context";
import { motion, useInView } from "framer-motion";
import { Boxes, Brain, CircleDollarSign, Puzzle } from "lucide-react";
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

export default function TheFixV2() {
	const { t } = useTranslation();
	const differentiators = [
		{ icon: Boxes, title: t("litepaper.fix.card1Title"), body: t("litepaper.fix.card1Body") },
		{ icon: Brain, title: t("litepaper.fix.card2Title"), body: t("litepaper.fix.card2Body") },
		{ icon: CircleDollarSign, title: t("litepaper.fix.card3Title"), body: t("litepaper.fix.card3Body") },
		{ icon: Puzzle, title: t("litepaper.fix.card4Title"), body: t("litepaper.fix.card4Body") },
	];
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			{/* Asymmetric gradient */}
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 20% 30%, rgba(0,255,135,0.05) 0%, transparent 45%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header, left aligned, not centered */}
				<RevealBlock>
					<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
						{t("litepaper.fix.eyebrow")}
					</span>
					<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase max-w-2xl">
						{t("litepaper.fix.headlineLeft")} <span className="text-[#00ff87]">{t("litepaper.fix.headlineRight")}</span>
					</h2>
				</RevealBlock>

				<RevealBlock delay={0.1}>
					<p className="mt-8 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						{t("litepaper.fix.intro1")}
					</p>
				</RevealBlock>

				<RevealBlock delay={0.15}>
					<p className="mt-5 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						{t("litepaper.fix.intro2")}
					</p>
				</RevealBlock>

				{/* Differentiator cards, asymmetric 2-col bento */}
				<div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4">
					{differentiators.map((item, i) => {
						const Icon = item.icon;
						return (
							<RevealBlock key={item.title} delay={0.2 + i * 0.08}>
								<motion.div
									className="relative rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 sm:p-7 h-full group transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[rgba(0,255,135,0.15)]"
									whileHover={{ y: -2 }}
									transition={{ type: "spring", stiffness: 400, damping: 25 }}
								>
									<div className="flex items-start gap-4">
										<div className="flex-shrink-0 w-10 h-10 rounded-sm bg-[rgba(0,255,135,0.06)] border border-[rgba(0,255,135,0.08)] flex items-center justify-center group-hover:bg-[rgba(0,255,135,0.1)] transition-colors duration-300">
											<Icon className="w-5 h-5 text-[#00ff87]" strokeWidth={1.5} />
										</div>
										<div className="min-w-0">
											<h3 className="font-satoshi text-lg font-bold text-[#e4e4e7] tracking-[-0.01em] lowercase mb-2 group-hover:text-[#00ff87] transition-colors duration-300">
												{item.title}
											</h3>
											<p className="text-sm leading-6 text-[#a1a1aa]">{item.body}</p>
										</div>
									</div>
								</motion.div>
							</RevealBlock>
						);
					})}
				</div>

				{/* Callout bar */}
				<RevealBlock delay={0.5}>
					<div className="mt-10 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-6 sm:p-7 relative overflow-hidden">
						<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
						<div className="pl-4">
							<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87] font-bold">
								{t("litepaper.fix.calloutLabel")}
							</span>
							<p className="mt-2 text-[#a1a1aa] text-base leading-relaxed">{t("litepaper.fix.calloutBody")}</p>
						</div>
					</div>
				</RevealBlock>
			</div>
		</section>
	);
}
