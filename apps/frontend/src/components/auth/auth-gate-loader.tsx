"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion";

/**
 * Skeleton shown while useAuthRequired() resolves a session or kicks an
 * unauthed user back to /auth/connect. Intentionally minimal: a single
 * monospace line, no spinner, no chrome. Pairs with the wizard / patron
 * pages so they don't flash dashboard content during the redirect.
 */
export function AuthGateLoader({ label = "verifying session" }: { label?: string }) {
	const reduceMotion = useReducedMotion();
	return (
		<div className="min-h-[60vh] flex items-center justify-center bg-[#08080a] px-6">
			<motion.div
				initial={reduceMotion ? false : { opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: EASE_OUT_EXPO }}
				className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]"
				role="status"
				aria-live="polite"
			>
				{label}
			</motion.div>
		</div>
	);
}
