"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface SectionDividerProps {
	variant?: "default" | "subtle";
}

export default function SectionDivider({ variant = "default" }: SectionDividerProps) {
	if (variant === "subtle") {
		return (
			<motion.div
				initial={{ opacity: 0, scaleX: 0 }}
				whileInView={{ opacity: 1, scaleX: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
				className="mx-auto my-2 h-px w-full max-w-[120px] origin-center bg-gradient-to-r from-transparent via-waifu-green/25 to-transparent"
			/>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.8 }}
			className="flex items-center justify-center gap-6 px-6 py-4"
		>
			<div className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-transparent to-waifu-green/20" />
			<div className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-white/5 opacity-40">
				<Image src="/brand/icon/icon_1024.png" alt="" fill className="object-cover" sizes="24px" />
			</div>
			<div className="h-px flex-1 max-w-[200px] bg-gradient-to-l from-transparent to-waifu-green/20" />
		</motion.div>
	);
}
