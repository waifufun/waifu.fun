"use client";

import { useTranslation } from "@/contexts/locale-context";
import { motion, useInView } from "framer-motion";
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

type TierStatus = "live" | "soon" | "later";

export default function EconomicsV2() {
	const { t } = useTranslation();
	const keyNumbers = [
		{
			stat: t("litepaper.economics.num1Stat"),
			unit: t("litepaper.economics.num1Unit"),
			result: t("litepaper.economics.num1Result"),
			note: t("litepaper.economics.num1Note"),
		},
		{
			stat: t("litepaper.economics.num2Stat"),
			unit: t("litepaper.economics.num2Unit"),
			result: t("litepaper.economics.num2Result"),
			note: t("litepaper.economics.num2Note"),
		},
		{
			stat: t("litepaper.economics.num3Stat"),
			unit: t("litepaper.economics.num3Unit"),
			result: t("litepaper.economics.num3Result"),
			note: t("litepaper.economics.num3Note"),
		},
	];
	const tiers: {
		name: string;
		tag: string;
		description: string;
		model: string;
		infra: string;
		highlight: boolean;
		status: TierStatus;
	}[] = [
		{
			name: t("litepaper.economics.tier1Name"),
			tag: t("litepaper.economics.tier1Tag"),
			description: t("litepaper.economics.tier1Description"),
			model: t("litepaper.economics.tier1Model"),
			infra: t("litepaper.economics.tier1Infra"),
			highlight: true,
			status: "live",
		},
		{
			name: t("litepaper.economics.tier2Name"),
			tag: t("litepaper.economics.tier2Tag"),
			description: t("litepaper.economics.tier2Description"),
			model: t("litepaper.economics.tier2Model"),
			infra: t("litepaper.economics.tier2Infra"),
			highlight: false,
			status: "soon",
		},
		{
			name: t("litepaper.economics.tier3Name"),
			tag: t("litepaper.economics.tier3Tag"),
			description: t("litepaper.economics.tier3Description"),
			model: t("litepaper.economics.tier3Model"),
			infra: t("litepaper.economics.tier3Infra"),
			highlight: false,
			status: "later",
		},
		{
			name: t("litepaper.economics.tier4Name"),
			tag: t("litepaper.economics.tier4Tag"),
			description: t("litepaper.economics.tier4Description"),
			model: t("litepaper.economics.tier4Model"),
			infra: t("litepaper.economics.tier4Infra"),
			highlight: false,
			status: "later",
		},
	];
	return (
		<section className="relative py-28 sm:py-36 overflow-hidden">
			<div
				className="absolute inset-0"
				style={{
					background: "radial-gradient(ellipse at 80% 30%, rgba(0,255,135,0.04) 0%, transparent 40%)",
				}}
			/>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<RevealBlock>
					<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
						{t("litepaper.economics.eyebrow")}
					</span>
					<h2 className="font-satoshi text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.03em] text-[#e4e4e7] leading-[0.95] lowercase max-w-lg">
						{t("litepaper.economics.headlineLeft")}{" "}
						<span className="text-[#00ff87]">{t("litepaper.economics.headlineRight")}</span>
					</h2>
				</RevealBlock>

				<RevealBlock delay={0.08}>
					<p className="mt-8 text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-[58ch]">
						{t("litepaper.economics.intro")}
					</p>
				</RevealBlock>

				{/* Key numbers, asymmetric bento row */}
				<div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4">
					{keyNumbers.map((num, i) => (
						<RevealBlock key={num.stat} delay={0.15 + i * 0.08}>
							<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-6 h-full">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-3xl sm:text-4xl font-bold text-[#00ff87] tracking-tight">
										{num.stat}
									</span>
									<span className="font-mono text-sm text-[#52525b]">{num.unit}</span>
								</div>
								<p className="mt-1 font-mono text-xs text-[#71717a] uppercase tracking-wide">{num.result}</p>
								<p className="mt-3 text-sm text-[#a1a1aa] leading-relaxed">{num.note}</p>
							</div>
						</RevealBlock>
					))}
				</div>

				{/* Tiers, editorial split layout */}
				<div className="mt-20 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
					{/* Left: tier context */}
					<div className="lg:col-span-4">
						<RevealBlock delay={0.1}>
							<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-4">
								{t("litepaper.economics.tiersEyebrow")}
							</span>
							<h3 className="font-satoshi text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-[#e4e4e7] leading-tight lowercase">
								{t("litepaper.economics.tiersHeadline")}
							</h3>
							<p className="mt-5 text-[#a1a1aa] text-base leading-relaxed">{t("litepaper.economics.tiersIntro")}</p>
							<p className="mt-3 text-[#71717a] text-[13px] leading-relaxed">
								{t("litepaper.economics.tiersDisclaimer")}
							</p>
							<div className="mt-8 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-5">
								<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
									{t("litepaper.economics.progressionLabel")}
								</span>
								<p className="mt-3 text-sm leading-6 text-[#a1a1aa]">{t("litepaper.economics.progressionBody")}</p>
							</div>
						</RevealBlock>
					</div>

					{/* Right: tier cards */}
					<div className="lg:col-span-8">
						<div className="space-y-4">
							{tiers.map((tier, index) => (
								<RevealBlock key={tier.name} delay={0.15 + index * 0.07}>
									<motion.article
										className={`relative rounded-sm border p-6 sm:p-7 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
											tier.highlight
												? "border-[rgba(0,255,135,0.2)] bg-[rgba(0,255,135,0.03)]"
												: "border-[rgba(255,255,255,0.06)] bg-[#111114] hover:border-[rgba(0,255,135,0.15)]"
										}`}
									>
										{tier.highlight && (
											<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
										)}
										<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
											<div className="max-w-xl">
												<div className="flex flex-wrap items-center gap-3">
													<span
														className={`font-mono text-[10px] uppercase tracking-[0.3em] ${
															tier.status === "live" ? "text-[#00ff87]" : "text-[#52525b]"
														}`}
													>
														{tier.status === "live" && (
															<span className="inline-block w-1 h-1 rounded-full bg-[#00ff87] animate-pulse mr-2 align-middle" />
														)}
														{tier.tag}
													</span>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														{String(index + 1).padStart(2, "0")}
													</span>
												</div>
												<h4
													className={`mt-3 font-satoshi text-2xl sm:text-3xl font-bold tracking-[-0.02em] lowercase ${
														tier.highlight ? "text-[#00ff87]" : "text-[#e4e4e7]"
													}`}
												>
													{tier.name}
												</h4>
												<p className="mt-3 text-sm leading-7 text-[#a1a1aa]">{tier.description}</p>
											</div>

											{/* Specs sidebar */}
											<div className="shrink-0 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(8,8,10,0.5)] p-4 lg:min-w-[13rem]">
												<div>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														{t("litepaper.economics.modelLabel")}
													</span>
													<p className="mt-1.5 text-sm leading-6 text-[#a1a1aa]">{tier.model}</p>
												</div>
												<div className="h-px bg-[rgba(255,255,255,0.04)] my-3" />
												<div>
													<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
														{t("litepaper.economics.hardwareLabel")}
													</span>
													<p className="mt-1.5 text-sm leading-6 text-[#a1a1aa]">{tier.infra}</p>
												</div>
											</div>
										</div>
									</motion.article>
								</RevealBlock>
							))}
						</div>
					</div>
				</div>

				{/* Governance callout */}
				<RevealBlock delay={0.5}>
					<div className="mt-12 rounded-sm border border-[rgba(0,255,135,0.12)] bg-[rgba(0,255,135,0.03)] p-6 sm:p-7 relative overflow-hidden">
						<div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00ff87] via-[#00ff87]/50 to-transparent" />
						<div className="pl-4">
							<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87] font-bold">
								{t("litepaper.economics.governanceLabel")}
							</span>
							<p className="mt-2 text-[#a1a1aa] text-base leading-relaxed">{t("litepaper.economics.governanceBody")}</p>
						</div>
					</div>
				</RevealBlock>
			</div>
		</section>
	);
}
