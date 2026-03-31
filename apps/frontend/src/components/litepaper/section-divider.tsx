"use client";

import { motion } from "framer-motion";

interface SectionDividerProps {
	variant?: "default" | "subtle";
}

export default function SectionDivider({ variant = "default" }: SectionDividerProps) {
	return (
		<motion.div
			initial={{ opacity: 0, scaleX: 0 }}
			whileInView={{ opacity: 1, scaleX: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
			className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"
		>
			<div
				className={`h-px w-full origin-center ${
					variant === "subtle"
						? "bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.04)] to-transparent"
						: "bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.12)] to-transparent"
				}`}
			/>
		</motion.div>
	);
}
