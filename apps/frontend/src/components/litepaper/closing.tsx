"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

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
			transition={{ duration: 0.6, delay, ease: EASE }}
		>
			{children}
		</motion.div>
	);
}

export default function Closing() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start end", "end end"],
	});

	const glowOpacity = useTransform(scrollYProgress, [0.3, 0.9], [0, 0.2]);

	return (
		<section ref={sectionRef} className="relative py-28 sm:py-40 overflow-hidden">
			<motion.div style={{ opacity: glowOpacity }} className="absolute inset-0">
				<div
					className="absolute inset-0"
					style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(0,255,135,0.1) 0%, transparent 50%)" }}
				/>
			</motion.div>

			<div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<SectionBlock>
					<div className="text-center">
						<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#00ff87]/60 block mb-8">tl;dr</span>

						<h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e4e7] leading-tight lowercase max-w-4xl mx-auto mb-6">
							launch a token. attach an AI agent. trading fees fine-tune the model.{" "}
							<span className="text-[#00ff87]">your waifu gets smarter the more people trade it.</span>
						</h2>

						<p className="text-[#a1a1aa] text-lg leading-relaxed max-w-2xl mx-auto">
							built on ElizaOS. hosted on Milady Cloud. wallets by Steward. open source all the way down.
						</p>
					</div>
				</SectionBlock>

				{/* CTA buttons */}
				<SectionBlock delay={0.15}>
					<div className="mt-12 flex flex-wrap items-center justify-center gap-4">
						<motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="relative">
							<motion.div
								className="absolute inset-0 rounded-sm blur-xl"
								style={{ background: "#00ff87" }}
								animate={{ opacity: [0.08, 0.15, 0.08], scale: [1, 1.02, 1] }}
								transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							/>
							<Link
								href="/#explore"
								className="relative inline-flex items-center gap-3 px-10 py-4 rounded-sm font-bold text-[#08080a] text-sm uppercase tracking-wide"
								style={{ background: "#00ff87" }}
							>
								explore tokens
								<ArrowRight className="w-4 h-4" />
							</Link>
						</motion.div>
						<Link
							href="/create"
							className="inline-flex items-center justify-center px-8 py-4 text-sm font-medium tracking-wide uppercase text-[#71717a] border border-[rgba(255,255,255,0.08)] rounded-none hover:text-[#e4e4e7] hover:border-[rgba(255,255,255,0.16)] transition-colors duration-300"
						>
							create a waifu
						</Link>
					</div>
				</SectionBlock>

				{/* Divider line */}
				<SectionBlock delay={0.25}>
					<div className="mt-14 h-px w-full max-w-md mx-auto bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.15)] to-transparent" />
				</SectionBlock>

				{/* Partner rail */}
				<SectionBlock delay={0.3}>
					<div className="mt-10 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[#3f3f46]">
						<span className="text-[#00ff87]/60">waifu.fun</span>
						<span className="text-[#27272a]">×</span>
						<a
							href="https://elizaos.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-[#71717a] transition-colors"
						>
							elizaOS
						</a>
						<span className="text-[#27272a]">×</span>
						<a
							href="https://milady.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-[#71717a] transition-colors"
						>
							milady cloud
						</a>
						<span className="text-[#27272a]">×</span>
						<span>steward</span>
					</div>
				</SectionBlock>
			</div>
		</section>
	);
}
