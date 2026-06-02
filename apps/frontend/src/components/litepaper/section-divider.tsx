"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface SectionDividerProps {
	variant?: "default" | "subtle" | "glitch";
}

const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノ";

function GlitchChars() {
	const [chars, setChars] = useState("");
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		const generate = () => {
			const len = 3 + Math.floor(Math.random() * 5);
			let s = "";
			for (let i = 0; i < len; i++) {
				s += KATAKANA[Math.floor(Math.random() * KATAKANA.length)];
			}
			return s;
		};
		setChars(generate());
		intervalRef.current = setInterval(
			() => {
				// Decorative re-render: skip while the tab is hidden, refresh on return.
				if (typeof document !== "undefined" && document.hidden) return;
				setChars(generate());
			},
			2000 + Math.random() * 3000,
		);
		const onVisible = () => {
			if (!document.hidden) setChars(generate());
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	return <span className="font-mono text-[10px] text-[#00ff87]/20 tracking-[0.4em] select-none">{chars}</span>;
}

export default function SectionDivider({ variant = "default" }: SectionDividerProps) {
	const isGlitch = variant === "glitch";

	return (
		<motion.div
			initial={{ opacity: 0, scaleX: 0 }}
			whileInView={{ opacity: 1, scaleX: 1 }}
			viewport={{ once: true }}
			transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
			className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"
		>
			{isGlitch ? (
				<div className="relative flex items-center justify-center py-2">
					<div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.12)] to-transparent" />
					<motion.div
						animate={{ opacity: [0.3, 0.8, 0.3] }}
						transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					>
						<GlitchChars />
					</motion.div>
				</div>
			) : (
				<div
					className={`h-px w-full origin-center ${
						variant === "subtle"
							? "bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.04)] to-transparent"
							: "bg-gradient-to-r from-transparent via-[rgba(0,255,135,0.12)] to-transparent"
					}`}
				/>
			)}
		</motion.div>
	);
}
