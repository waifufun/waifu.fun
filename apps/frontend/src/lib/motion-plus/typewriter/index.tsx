// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3
//
// Subtle character touch: types text out on first paint. The animation
// only re-runs when the `text` prop actually changes, so wrapping a stable
// string in this component plays once and stays put on subsequent
// re-renders. Pass `play={false}` to disable entirely.

"use client";

import { type AnimationPlaybackControls, animate, delay, motion, useMotionValue } from "framer-motion";
import {
	type CSSProperties,
	type ComponentPropsWithoutRef,
	type ElementType,
	type ForwardedRef,
	type ReactElement,
	type RefAttributes,
	forwardRef,
	useEffect,
	useRef,
} from "react";
import { getTypewriterDelay } from "./utils/delay";
import { getNextText } from "./utils/get-next-text";

export const TYPING_SPEEDS = {
	slow: 130,
	normal: 75,
	fast: 30,
} as const;

export type TypingSpeed = keyof typeof TYPING_SPEEDS;

type TypewriterOwnProps<T extends ElementType> = {
	children: string;
	as?: T;
	/** Typing speed preset. Either a TypingSpeed key or a custom ms-per-char number. */
	speed?: TypingSpeed | number;
	/** Variance factor for human-feeling timing. Defaults to `"natural"`. */
	variance?: number | "natural";
	play?: boolean;
	cursorClassName?: string;
	cursorStyle?: CSSProperties;
	textClassName?: string;
	textStyle?: CSSProperties;
	cursorBlinkDuration?: number;
	cursorBlinkRepeat?: number;
	onComplete?: () => void;
	onChange?: (info: { text: string; character: string; isBackspace: boolean }) => void;
	replace?: "all" | "type";
	backspace?: "character" | "word" | "all";
	backspaceFactor?: number;
	"aria-label"?: string;
};

export type TypewriterProps<T extends ElementType = "span"> = TypewriterOwnProps<T> &
	Omit<ComponentPropsWithoutRef<T>, keyof TypewriterOwnProps<T>>;

function TypewriterImpl<T extends ElementType = "span">(
	{
		children: text = "",
		as,
		speed = "normal",
		variance = "natural",
		cursorClassName = "motion-typewriter-cursor",
		cursorStyle,
		cursorBlinkDuration = 0.5,
		cursorBlinkRepeat = Number.POSITIVE_INFINITY,
		onComplete,
		onChange,
		play = true,
		"aria-label": ariaLabel,
		textClassName,
		textStyle,
		replace = "type",
		backspace = "character",
		backspaceFactor = 0.2,
		...props
	}: TypewriterProps<T>,
	ref: ForwardedRef<HTMLElement>,
) {
	const Component = (as || "span") as ElementType;
	const targetText = useRef(text);
	const displayText = useMotionValue("");
	const cancelDelay = useRef<VoidFunction | null>(null);
	const cursorBlinkAnimation = useRef<AnimationPlaybackControls | null>(null);
	const cursorRef = useRef<HTMLSpanElement>(null);

	const interval = typeof speed === "number" ? speed : TYPING_SPEEDS[speed];

	const clearDelay = () => {
		cancelDelay.current?.();
		cancelDelay.current = null;
	};

	const startCursorBlinkAnimation = () => {
		if (!cursorRef.current) return;
		const blinkRepeat = Number.isFinite(cursorBlinkRepeat)
			? Math.max(0, cursorBlinkRepeat) * 2
			: Number.POSITIVE_INFINITY;
		const controls = animate(
			cursorRef.current,
			{
				opacity: [1, 1, 0, 0],
			},
			{
				duration: cursorBlinkDuration,
				times: [0, 0.5, 0.5, 1],
				ease: "linear",
				repeat: blinkRepeat,
				repeatType: "reverse",
			},
		);
		cursorBlinkAnimation.current = controls;
		controls.then(
			() => controls.cancel(),
			() => undefined,
		);
	};

	useEffect(() => {
		// If we're using replace: "all" and the text changes, instantly
		// reset the displayed text.
		if (replace === "all" && text !== targetText.current) {
			displayText.set("");
		}

		targetText.current = text;
	}, [text, replace, displayText]);

	useEffect(() => {
		if (!play) {
			startCursorBlinkAnimation();
			clearDelay();
			return;
		}

		cursorBlinkAnimation.current?.cancel();

		const nextCharacter = () => {
			const previousText = displayText.get();
			const nextText = getNextText(previousText, text, replace, backspace);

			displayText.set(nextText);

			if (onChange) {
				const isBackspace = nextText.length < previousText.length;
				const character = isBackspace ? previousText.slice(nextText.length) : nextText.slice(previousText.length);
				onChange({ text: nextText, character, isBackspace });
			}

			if (nextText !== text) {
				scheduleNextCharacter();
			} else {
				startCursorBlinkAnimation();
				onComplete?.();
			}
		};

		const scheduleNextCharacter = () => {
			cancelDelay.current = delay(
				nextCharacter,
				getTypewriterDelay(text, displayText.get(), interval, variance, backspaceFactor),
			);
		};

		if (!cancelDelay.current) {
			scheduleNextCharacter();
		}

		return clearDelay;
	}, [play, onComplete, onChange, text, interval, variance, backspaceFactor, backspace]);

	// Cancel the (possibly-infinite) cursor-blink animation on unmount so it
	// doesn't keep running / leak a controls handle after the component is gone.
	useEffect(() => () => cursorBlinkAnimation.current?.cancel(), []);

	return (
		<Component ref={ref} {...props} aria-label={ariaLabel || text}>
			<motion.span className={textClassName} style={(textStyle as Record<string, unknown>) ?? {}}>
				{displayText}
			</motion.span>
			<motion.span
				ref={cursorRef}
				className={cursorClassName}
				style={
					{
						display: "inline-block",
						width: "2px",
						height: "1em",
						backgroundColor: "currentColor",
						position: "relative",
						top: "0.1em",
						left: "0.2em",
						...cursorStyle,
					} as Record<string, unknown>
				}
			/>
		</Component>
	);
}

// Cast at the call boundary so the inner generic narrows correctly after
// forwardRef (forwardRef's type machinery doesn't preserve generics on its own).
export const Typewriter = (
	forwardRef as unknown as (
		render: (props: TypewriterProps<ElementType>, ref: ForwardedRef<HTMLElement>) => ReactElement | null,
	) => <T extends ElementType = "span">(props: TypewriterProps<T> & RefAttributes<HTMLElement>) => ReactElement | null
)(TypewriterImpl as (props: TypewriterProps<ElementType>, ref: ForwardedRef<HTMLElement>) => ReactElement | null);
