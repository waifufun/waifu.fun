"use client";

import { useLocale } from "@/contexts/locale-context";
import { EASE_HERO } from "@/lib/motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { memo, useEffect, useMemo, useState } from "react";

const HOLD_MS = 2400;
const FALLBACK_VERBS = ["create", "trade", "shill", "scam", "blackmail"] as const;

// Brand neon and the resting verb tint. Used for a brief flash on each swap.
const ACCENT = "#00ff87";
const REST = "#d4d4d8";

function readVerbs(messages: Record<string, unknown>): string[] {
	const hero = messages.hero;
	if (hero && typeof hero === "object") {
		const raw = (hero as Record<string, unknown>).verbs;
		if (Array.isArray(raw)) {
			const cleaned = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
			if (cleaned.length > 0) return cleaned;
		}
	}
	return [...FALLBACK_VERBS];
}

function pickLongest(words: readonly string[]): string {
	let longest = words[0] ?? "";
	for (const w of words) {
		// Use Array.from for grapheme-ish counting (CJK + ASCII safe enough here).
		if (Array.from(w).length > Array.from(longest).length) longest = w;
	}
	return longest;
}

// The trailing period rides with the verb so it stays glued to the word
// regardless of how wide the locked width container is. Visually constant,
// just rendered inside the animated unit.
const TAIL = ".";

/**
 * RotatingVerb
 *
 * The fun part of the hero headline: cycles through a verb pool of agent
 * survival modes ("create", "scam", "shill", "blackmail", ...).
 *
 * Design constraints:
 * - Width-stable: an invisible reference word (the longest in the pool) sits
 *   under the animated word and locks the container width. No reflow on swap.
 * - SSR-safe: the first paint shows verbs[0]; rotation starts on client mount.
 * - Hover pauses, so the user can read whatever caught their eye.
 * - Honors prefers-reduced-motion: drops rotation entirely and shows verbs[0].
 * - Cleanup on unmount; no setInterval leaks.
 */
function RotatingVerbInner() {
	const { messages } = useLocale();
	const verbs = useMemo(() => readVerbs(messages), [messages]);
	const longest = useMemo(() => pickLongest(verbs), [verbs]);
	const reduced = useReducedMotion();

	const [tick, setTick] = useState(0);
	const [hovered, setHovered] = useState(false);
	const [docHidden, setDocHidden] = useState(false);

	const paused = hovered || docHidden;

	useEffect(() => {
		if (typeof document === "undefined") return;
		const onVis = () => setDocHidden(document.hidden);
		document.addEventListener("visibilitychange", onVis);
		return () => {
			document.removeEventListener("visibilitychange", onVis);
		};
	}, []);

	useEffect(() => {
		if (reduced) return;
		if (paused) return;
		if (verbs.length <= 1) return;
		const id = window.setInterval(() => {
			setTick((t) => t + 1);
		}, HOLD_MS);
		return () => {
			window.clearInterval(id);
		};
	}, [reduced, paused, verbs.length]);

	// Resolve the verb to display from the tick counter.
	const current = useMemo(() => {
		if (verbs.length === 0) return "";
		const i = ((tick % verbs.length) + verbs.length) % verbs.length;
		return verbs[i] ?? verbs[0] ?? "";
	}, [tick, verbs]);

	const handleEnter = () => setHovered(true);
	const handleLeave = () => setHovered(false);

	// Reduced-motion: render a single verb, no animation, no rotation.
	if (reduced) {
		return (
			<span className="relative inline-flex items-baseline justify-center align-baseline">
				<span aria-hidden="true" className="invisible whitespace-nowrap">
					{longest}
					{TAIL}
				</span>
				<span className="absolute inset-0 flex items-baseline justify-center whitespace-nowrap">
					{verbs[0]}
					{TAIL}
				</span>
			</span>
		);
	}

	return (
		<span
			className="relative inline-flex items-baseline justify-center align-baseline cursor-default"
			onMouseEnter={handleEnter}
			onMouseLeave={handleLeave}
			onFocus={handleEnter}
			onBlur={handleLeave}
		>
			{/* Invisible longest-word placeholder locks width so swaps don't shift layout. */}
			<span aria-hidden="true" className="invisible whitespace-nowrap">
				{longest}
				{TAIL}
			</span>
			{/* Live region: announce the current verb for screen readers. */}
			<span
				className="absolute inset-0 flex items-baseline justify-center overflow-hidden whitespace-nowrap"
				aria-live="polite"
				aria-atomic="true"
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={`${current}-${tick}`}
						className="inline-block"
						initial={{ y: 28, opacity: 0, color: ACCENT }}
						animate={{
							y: 0,
							opacity: 1,
							color: [ACCENT, ACCENT, REST],
						}}
						exit={{ y: -28, opacity: 0 }}
						transition={{
							duration: 0.45,
							ease: EASE_HERO,
							color: { duration: 0.6, times: [0, 0.25, 1], ease: EASE_HERO },
						}}
						aria-label={current}
					>
						{current}
						{TAIL}
					</motion.span>
				</AnimatePresence>
			</span>
		</span>
	);
}

// Memoize: this component runs a perpetual interval. Isolate it so the parent
// hero never re-renders alongside the rotation tick.
export const RotatingVerb = memo(RotatingVerbInner);
export default RotatingVerb;
