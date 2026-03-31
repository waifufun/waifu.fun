"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

export default function Closing() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const { scrollYProgress } = useScroll({
		target: sectionRef,
		offset: ["start end", "end end"],
	});

	const glowOpacity = useTransform(scrollYProgress, [0.3, 0.9], [0, 0.35]);
	const textY = useTransform(scrollYProgress, [0.2, 0.8], [60, 0]);
	const textOpacity = useTransform(scrollYProgress, [0.2, 0.6], [0, 1]);

	return (
		<section
			ref={sectionRef}
			className="relative overflow-hidden px-6 py-32 sm:px-8 lg:px-12 lg:py-48 xl:px-16"
		>
			<motion.div
				style={{ opacity: glowOpacity }}
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,135,0.2),transparent_35%)]"
			/>

			<div className="relative mx-auto max-w-[1200px]">
				<motion.div
					style={{ y: textY, opacity: textOpacity }}
					className="flex flex-col items-center text-center"
				>
					<div className="relative mb-10 h-16 w-16 overflow-hidden rounded-full border border-waifu-green/25 bg-waifu-green/10 shadow-crt">
						<Image
							src="/brand/icon/icon_1024.png"
							alt="waifu.fun"
							fill
							className="object-cover"
							sizes="64px"
						/>
					</div>

					<p className="font-orbitron text-[11px] uppercase tracking-[0.55em] text-waifu-green/80">
						tl;dr
					</p>

					<h2 className="mx-auto mt-8 max-w-4xl font-orbitron text-[clamp(1.8rem,4vw,4rem)] uppercase leading-[0.95] tracking-[-0.05em] text-white">
						launch a token. attach an AI agent. trading fees fine-tune the model.{" "}
						<span className="text-waifu-green [text-shadow:0_0_30px_rgba(0,255,135,0.3)]">
							your waifu gets smarter the more people trade it.
						</span>
					</h2>

					<motion.p
						initial={{ opacity: 0, y: 16 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mx-auto mt-8 max-w-2xl font-satoshi text-lg leading-8 text-white/55"
					>
						built on ElizaOS. hosted on Milady Cloud. wallets by Steward. open source all the way down.
					</motion.p>

					{/* CTA buttons */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-12 flex flex-wrap items-center justify-center gap-4"
					>
						<Link
							href="/tokens"
							className="group inline-flex items-center gap-2.5 rounded-full bg-waifu-green px-8 py-4 text-sm font-bold uppercase tracking-[0.12em] text-black transition-all duration-300 hover:bg-waifu-green/90 hover:shadow-[0_0_32px_rgba(0,255,135,0.35)]"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							Explore Tokens
							<svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
							</svg>
						</Link>
						<Link
							href="/create"
							className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-4 text-sm uppercase tracking-[0.12em] text-white/70 transition-all duration-300 hover:border-white/25 hover:bg-white/10 hover:text-white/90"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							Create a Waifu
						</Link>
					</motion.div>

					<motion.div
						initial={{ scaleX: 0, opacity: 0 }}
						whileInView={{ scaleX: 1, opacity: 1 }}
						viewport={{ once: true }}
						transition={{ delay: 0.5, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
						className="mt-14 h-px w-full max-w-md origin-center bg-gradient-to-r from-transparent via-waifu-green/40 to-transparent"
					/>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
						className="mt-10 flex flex-wrap items-center justify-center gap-4"
					>
						<span
							className="rounded-full border border-waifu-green/20 bg-waifu-green/8 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-waifu-green"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							waifu.fun
						</span>
						<span className="text-white/20">/</span>
						<span
							className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/50"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							elizaOS
						</span>
						<span className="text-white/20">/</span>
						<span
							className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/50"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							milady cloud
						</span>
						<span className="text-white/20">/</span>
						<span
							className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-white/50"
							style={{ fontFamily: "DMMono, monospace" }}
						>
							steward
						</span>
					</motion.div>
				</motion.div>
			</div>
		</section>
	);
}
