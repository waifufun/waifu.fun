"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
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
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(0,255,135,0.06),transparent_28%)]" />

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

					<h2 className="mx-auto mt-8 max-w-5xl font-orbitron text-[clamp(2rem,4.5vw,4.5rem)] uppercase leading-[0.95] tracking-[-0.05em] text-white">
						launch a waifu. it gets fine-tuned into something{" "}
						<span className="text-waifu-green [text-shadow:0_0_30px_rgba(0,255,135,0.3)]">
							actually unique
						</span>
						, improve over time, and create value for the people who care about them.
					</h2>

					<motion.div
						initial={{ scaleX: 0, opacity: 0 }}
						whileInView={{ scaleX: 1, opacity: 1 }}
						viewport={{ once: true }}
						transition={{ delay: 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
						className="mt-14 h-px w-full max-w-md origin-center bg-gradient-to-r from-transparent via-waifu-green/40 to-transparent"
					/>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
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

					<motion.p
						initial={{ opacity: 0 }}
						whileInView={{ opacity: 1 }}
						viewport={{ once: true }}
						transition={{ delay: 0.7, duration: 0.8 }}
						className="mt-12 font-satoshi text-sm leading-6 text-white/35"
						style={{ fontFamily: "DMMono, monospace" }}
					>
						waifu.fun
					</motion.p>
				</motion.div>
			</div>
		</section>
	);
}
