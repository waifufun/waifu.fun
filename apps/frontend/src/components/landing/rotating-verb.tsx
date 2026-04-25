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

// The trailing period rides with the verb so it stays glued to the word
// regardless of swap timing. Rendered inside the animated unit.
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
			<span className="inline-block whitespace-nowrap align-baseline">
				{verbs[0]}
				{TAIL}
			</span>
		);
	}

	// No width-lock. Let the verb flow naturally so 'if they lie. / if they
	// don't.' lines up correctly. Framer's layout animation smooths width
	// changes between swaps so the trailing 'they die' line doesn't jump.
	return (
		<span
			className="inline-flex items-baseline align-baseline cursor-default whitespace-nowrap"
			aria-live="polite"
			aria-atomic="true"
			onMouseEnter={handleEnter}
			onMouseLeave={handleLeave}
			onFocus={handleEnter}
			onBlur={handleLeave}
		>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={`${current}-${tick}`}
					layout="position"
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
	);
}

// Memoize: this component runs a perpetual interval. Isolate it so the parent
// hero never re-renders alongside the rotation tick.
export const RotatingVerb = memo(RotatingVerbInner);
export default RotatingVerb;
