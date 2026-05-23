// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3
//
// Adds a brief scramble/decode effect when text content changes. We use it
// on live-updating numeric strings (price change %, volumes) so the eye
// notices the update without a hard flash. Keep durations ≤300ms — anything
// longer slows down reading.

"use client";

import { motion, useIsomorphicLayoutEffect, useMotionValue } from "framer-motion";
import { type ElementType, type ForwardedRef, forwardRef, useRef } from "react";
import { type ScrambleTextControls, type StaggerFunction, scrambleText } from "./scramble-text";

import type { CSSProperties, ComponentPropsWithoutRef, ReactElement, RefAttributes } from "react";

type ScrambleTextOwnProps<T extends ElementType> = {
	/** The text content to scramble. */
	children: string;
	/** The HTML element or component to render as. Defaults to `"span"`. */
	as?: T;
	/**
	 * Whether the scramble animation is active.
	 * When `true`, characters scramble per delay/duration.
	 * When `false`, characters reveal immediately (preserving stagger offsets).
	 */
	active?: boolean;
	/** Delay before each character starts scrambling. Number (seconds) or stagger function. */
	delay?: number | StaggerFunction;
	/**
	 * How long each character stays scrambled before revealing.
	 * Number (seconds), `Infinity`, or stagger function.
	 */
	duration?: number | StaggerFunction;
	/** Seconds between random character switches while scrambling. */
	interval?: number;
	/** Characters to use for scrambling. String or array (for emoji support). */
	chars?: string | string[];
	/** Callback fired when all characters are revealed. */
	onComplete?: () => void;
	className?: string;
	style?: CSSProperties;
};

export type ScrambleTextProps<T extends ElementType = "span"> = ScrambleTextOwnProps<T> &
	Omit<ComponentPropsWithoutRef<T>, keyof ScrambleTextOwnProps<T>>;

type MotionComponents = typeof motion;
function getMotionComponent(as: ElementType | undefined): MotionComponents[keyof MotionComponents] {
	const tag = (as || "span") as keyof MotionComponents;
	return motion[tag] || motion.span;
}

function ScrambleTextImpl<T extends ElementType = "span">(
	{
		children: text = "",
		as,
		active = true,
		delay,
		duration,
		interval,
		chars,
		onComplete,
		...props
	}: ScrambleTextProps<T>,
	ref: ForwardedRef<HTMLElement>,
) {
	const MotionComponent = getMotionComponent(as) as ElementType;
	const displayText = useMotionValue(text);
	const controlsRef = useRef<ScrambleTextControls | null>(null);
	const onCompleteRef = useRef(onComplete);

	useIsomorphicLayoutEffect(() => {
		onCompleteRef.current = onComplete;
	});

	useIsomorphicLayoutEffect(() => {
		displayText.set(text);
	}, [text]);

	useIsomorphicLayoutEffect(() => {
		controlsRef.current?.stop();

		const opts: Parameters<typeof scrambleText>[1] = {
			onComplete: () => onCompleteRef.current?.(),
		};
		if (delay !== undefined) opts.delay = delay;
		if (duration !== undefined) opts.duration = duration;
		if (interval !== undefined) opts.interval = interval;
		if (chars !== undefined) opts.chars = chars;

		controlsRef.current = scrambleText(displayText, opts);

		if (!active) {
			controlsRef.current.finish();
		}

		return () => controlsRef.current?.stop();
	}, [active, text, delay, duration, interval, chars]);

	return (
		<MotionComponent ref={ref} {...props}>
			{displayText}
		</MotionComponent>
	);
}

// Cast at the call boundary so the inner generic narrows correctly after
// forwardRef (forwardRef's type machinery doesn't preserve generics on its own).
export const ScrambleText = (
	forwardRef as unknown as (
		render: (props: ScrambleTextProps<ElementType>, ref: ForwardedRef<HTMLElement>) => ReactElement | null,
	) => <T extends ElementType = "span">(props: ScrambleTextProps<T> & RefAttributes<HTMLElement>) => ReactElement | null
)(ScrambleTextImpl as (props: ScrambleTextProps<ElementType>, ref: ForwardedRef<HTMLElement>) => ReactElement | null);
