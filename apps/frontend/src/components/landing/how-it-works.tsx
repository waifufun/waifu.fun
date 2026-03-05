"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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

const steps = [
	{
		num: "01",
		title: "deploy your milady",
		description:
			"Launch your AI agent through Milady Cloud, embedded in Eliza Cloud. Configure personality, trading strategy, and risk parameters. Your milady becomes a waifu — an autonomous agent with its own token on Solana.",
		image: "/waifus/how-deploy.png",
	},
	{
		num: "02",
		title: "waifu trades autonomously",
		description:
			"Your waifu runs on ElizaOS — monitoring markets 24/7, identifying opportunities, and executing trades. Always online, terminally onchain. No manual intervention needed.",
		image: "/waifus/how-trade.png",
	},
	{
		num: "03",
		title: "earn from performance",
		description:
			"As your agent generates returns, token holders benefit proportionally. Track performance in real-time, adjust parameters, or let it run. Your agent works while you sleep.",
		image: "/waifus/how-earn.png",
	},
];

function StepImage({ src, alt }: { src: string; alt: string }) {
	return (
		<div className="relative overflow-hidden rounded-sm w-full aspect-[4/5]">
			<Image
				src={src}
				alt={alt}
				fill
				className="object-cover"
			/>
			<div className="absolute inset-0 bg-gradient-to-r from-[#08080a] via-transparent to-[#08080a]" />
			<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08080a]" />
		</div>
	);
}

export default function HowItWorks() {
	return (
		<section id="how-it-works" className="relative py-24 sm:py-32 bg-[#08080a]">
			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<SectionBlock>
					<div className="text-center max-w-2xl mx-auto mb-20">
						<h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase">
							how it works
						</h2>
						<p className="mt-4 text-[#a1a1aa] text-base leading-relaxed max-w-xl mx-auto">
							milady cloud × eliza cloud — deploy your personal AI as an autonomous economic agent that
							trades, earns, and runs 24/7 on Solana.
						</p>
					</div>
				</SectionBlock>

				{/* Steps */}
				<div className="space-y-0">
					{steps.map((step, i) => {
						const imageLeft = i % 2 === 0;

						const imageBlock = (
							<div className="md:col-span-1">
								<StepImage src={step.image} alt={step.title} />
							</div>
						);

						const textBlock = (
							<div className="md:col-span-1 flex flex-col justify-center gap-4 py-6 sm:py-8">
								{/* Step label */}
								<div className="flex items-center gap-3">
									<span className="font-mono text-xs font-semibold tracking-widest text-[#00ff87]">
										STEP {step.num}
									</span>
									<div className="h-px flex-1 max-w-[48px] bg-[#00ff87]/25" />
								</div>

								{/* Title */}
								<h3 className="text-xl sm:text-2xl font-bold text-[#e4e4e7] tracking-[-0.02em] lowercase">
									{step.title}
								</h3>

								{/* Description */}
								<p className="text-[#a1a1aa] text-[15px] leading-relaxed max-w-md">
									{step.description}
								</p>
							</div>
						);

						return (
							<SectionBlock key={step.num} delay={i * 0.12}>
								<div className="relative">
									{/* Connector line between steps */}
									{i < steps.length - 1 && (
										<div className="hidden md:block absolute left-1/2 -bottom-0 w-px h-8 bg-gradient-to-b from-[#00ff87]/20 to-transparent -translate-x-1/2 translate-y-full z-10" />
									)}

									<div
										className={`grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-center border border-[rgba(255,255,255,0.06)] bg-[#111114] rounded-sm p-4 sm:p-6`}
									>
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

				{/* Read the full story link */}
				<SectionBlock delay={0.4}>
					<div className="mt-12 text-center">
						<Link
							href="/story"
							className="inline-flex items-center gap-2 text-[#a1a1aa] hover:text-[#00ff87] transition-colors duration-200 text-sm font-medium group"
						>
							read the full story
							<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
						</Link>
					</div>
				</SectionBlock>
			</div>
		</section>
	);
}
