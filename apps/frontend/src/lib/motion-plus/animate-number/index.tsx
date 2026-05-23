// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3
//
// Premium per-digit physics animation with smooth Intl.NumberFormat
// integration. Drop-in replacement for @number-flow/react with better
// handling of currency, separators, and big-jump transitions.

"use client";

import {
	type HTMLMotionProps,
	MotionConfig,
	MotionConfigContext,
	type MotionConfigProps,
	easeOut,
	motion,
} from "framer-motion";
import { type ComponentProps, forwardRef, useContext, useMemo, useRef } from "react";
import { Mask, maskHeight } from "./Mask";
import { NumberSection } from "./NumberSection";
import type { Trend } from "./types";
import { formatToParts } from "./utils/format-parts";

export const DEFAULT_TRANSITION = {
	opacity: { duration: 1, ease: easeOut }, // ~0.5s perceptual
	y: { type: "spring", duration: 1, bounce: 0 },
	width: { type: "spring", duration: 1, bounce: 0 },
} as const satisfies MotionConfigProps["transition"];

export type AnimateNumberProps = Omit<HTMLMotionProps<"span">, "children"> & {
	/** The number to display. Accepts `number`, `bigint`, or numeric `string`. */
	children: number | bigint | string;
	/** Locale(s) for `Intl.NumberFormat`. e.g. `"en-US"`, `["de-DE", "en-US"]`. */
	locales?: Intl.LocalesArgument;
	/**
	 * Options passed to `Intl.NumberFormat`.
	 * Scientific and engineering notation are not supported.
	 */
	format?: Omit<Intl.NumberFormatOptions, "notation"> & {
		notation?: Exclude<Intl.NumberFormatOptions["notation"], "scientific" | "engineering">;
	};
	/** Override the animation transition. Applies to `y` (digit spin), `width` (resize), `opacity` (enter/exit). */
	transition?: ComponentProps<typeof MotionConfig>["transition"];
	/** Static text appended after the number (e.g. `"/mo"`). */
	suffix?: string;
	/** Static text prepended before the number (e.g. `"~"`). */
	prefix?: string;
	/**
	 * Controls digit spin direction.
	 *
	 * - `1`: always spin upward (9 → 0)
	 * - `-1`: always spin downward (0 → 9)
	 * - `0` / `undefined`: auto-detect via value change
	 * - `(oldValue, newValue) => number`: custom function
	 */
	trend?: Trend;
};

export const AnimateNumber = forwardRef<HTMLDivElement, AnimateNumberProps>(function AnimateNumber(
	{ children: value, locales, format, transition, style, suffix, prefix, trend, ...rest },
	ref,
) {
	const parts = useMemo(
		() => {
			const opts: { locales?: Intl.LocalesArgument; format?: Intl.NumberFormatOptions } = {};
			if (locales !== undefined) opts.locales = locales;
			if (format !== undefined) opts.format = format as Intl.NumberFormatOptions;
			return formatToParts(value, opts, prefix, suffix);
		},
		[value, locales, format, prefix, suffix],
	);
	const { pre, integer, fraction, post, formatted } = parts;

	const contextTransition = useContext(MotionConfigContext).transition;
	const resolvedTransition = transition ?? contextTransition ?? DEFAULT_TRANSITION;

	const numericValue = typeof value === "string" ? parseFloat(value) : Number(value);
	const prevValueRef = useRef(numericValue);
	const prevValue = prevValueRef.current;
	prevValueRef.current = numericValue;

	let resolvedTrend: number;
	if (typeof trend === "function") {
		resolvedTrend = trend(prevValue, numericValue);
	} else if (trend !== undefined) {
		resolvedTrend = trend;
	} else {
		resolvedTrend = Math.sign(numericValue - prevValue);
	}

	return (
		<MotionConfig transition={resolvedTransition}>
			<motion.span
				{...rest}
				ref={ref as React.Ref<HTMLSpanElement>}
				style={{
					lineHeight: 1,
					...style,
					display: "inline-flex",
					isolation: "isolate",
					whiteSpace: "nowrap",
				}}
			>
				<span
					aria-label={formatted}
					style={{
						display: "inline-flex",
						direction: "ltr",
						isolation: "isolate",
						position: "relative",
						zIndex: -1,
					}}
				>
					<NumberSection
						style={{ padding: `calc(${maskHeight}/2) 0` }}
						aria-hidden={true}
						justify="right"
						mode="popLayout"
						parts={pre}
						name="pre"
						trend={resolvedTrend}
					/>
					<Mask>
						<NumberSection justify="right" parts={integer} name="integer" trend={resolvedTrend} />
						<NumberSection parts={fraction} name="fraction" trend={resolvedTrend} />
					</Mask>
					<NumberSection
						style={{ padding: `calc(${maskHeight}/2) 0` }}
						aria-hidden={true}
						mode="popLayout"
						parts={post}
						name="post"
						trend={resolvedTrend}
					/>
				</span>
			</motion.span>
		</MotionConfig>
	);
});
