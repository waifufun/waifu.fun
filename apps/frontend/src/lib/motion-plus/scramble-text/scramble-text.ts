// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus-dom@2.11.3
//
// Vanilla scramble-text engine. Accepts an Element selector, an Element,
// or a MotionValue<string> as the target. The React wrapper in `index.tsx`
// uses the MotionValue path.

import type { MotionValue } from "framer-motion";

export type StaggerFunction = (index: number, total: number) => number;

export interface ScrambleTextOptions {
	chars?: string | string[];
	delay?: number | StaggerFunction;
	duration?: number | StaggerFunction;
	interval?: number;
	onComplete?: () => void;
}

export interface ScrambleTextControls {
	stop: () => void;
	play: () => void;
	finish: () => void;
	finished: Promise<void>;
}

export type ScrambleTextTarget = Element | string | MotionValue<string>;

export const DEFAULT_SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function getScrambleChar(chars: string | string[] | undefined): string {
	const charSet = chars ?? DEFAULT_SCRAMBLE_CHARS;
	if (typeof charSet === "string") {
		return charSet[Math.floor(Math.random() * charSet.length)] ?? "";
	}
	return charSet[Math.floor(Math.random() * charSet.length)] ?? "";
}

function resolveStagger(
	value: number | StaggerFunction | undefined,
	index: number,
	total: number,
	defaultValue: number,
): number {
	if (typeof value === "function") {
		return value(index, total);
	}
	return value ?? defaultValue;
}

function isMotionValue(target: ScrambleTextTarget): target is MotionValue<string> {
	return (
		target !== null &&
		typeof target === "object" &&
		"set" in target &&
		typeof (target as { set: unknown }).set === "function"
	);
}

function resolveElement(elementOrSelector: Element | string): Element | null {
	if (typeof elementOrSelector === "string") {
		return document.querySelector(elementOrSelector);
	}
	return elementOrSelector;
}

export function scrambleText(target: ScrambleTextTarget, options: ScrambleTextOptions = {}): ScrambleTextControls {
	const { chars, delay: delayOption = 0, duration = 1, interval = 0.05, onComplete } = options;

	const motionValueMode = isMotionValue(target);
	let originalText: string;
	let setText: (text: string) => void;

	if (motionValueMode) {
		originalText = target.get();
		setText = (text: string) => target.set(text);
	} else {
		const resolvedElement = resolveElement(target);
		if (!resolvedElement) {
			return {
				stop: () => {},
				play: () => {},
				finish: () => {},
				finished: Promise.resolve(),
			};
		}
		originalText = resolvedElement.textContent || "";
		setText = (text: string) => {
			resolvedElement.textContent = text;
		};
	}

	const charCount = originalText.length;

	type CharState = "idle" | "scrambling" | "revealed";
	const charStates: CharState[] = new Array(charCount).fill("idle");
	const cancelFns: (VoidFunction | null)[] = new Array(charCount).fill(null);

	let scrambleIntervalId: ReturnType<typeof setInterval> | null = null;
	let isActive = false;
	let resolveFinished: (() => void) | null = null;

	const finished = new Promise<void>((resolve) => {
		resolveFinished = resolve;
	});

	function updateDisplay() {
		let display = "";
		for (let i = 0; i < charCount; i++) {
			const char = originalText[i] ?? "";
			if (char === " " || charStates[i] === "revealed") {
				display += char;
			} else if (charStates[i] === "scrambling") {
				display += getScrambleChar(chars);
			} else {
				display += char;
			}
		}
		setText(display);
	}

	function checkComplete() {
		const allRevealed = charStates.every((state, i) => state === "revealed" || originalText[i] === " ");
		if (allRevealed) {
			stopScrambleLoop();
			onComplete?.();
			resolveFinished?.();
		}
	}

	function startScrambleLoop() {
		if (scrambleIntervalId) return;
		scrambleIntervalId = setInterval(updateDisplay, interval * 1000);
	}

	function stopScrambleLoop() {
		if (scrambleIntervalId) {
			clearInterval(scrambleIntervalId);
			scrambleIntervalId = null;
		}
	}

	function clearAllTimers() {
		for (let i = 0; i < cancelFns.length; i++) {
			const cancel = cancelFns[i];
			if (cancel) {
				cancel();
				cancelFns[i] = null;
			}
		}
	}

	function scheduleReveal(i: number, delayMs: number) {
		const timerId = setTimeout(() => {
			if (!isActive) return;
			charStates[i] = "revealed";
			updateDisplay();
			checkComplete();
		}, delayMs);
		cancelFns[i] = () => clearTimeout(timerId);
	}

	function play() {
		if (isActive) return;
		isActive = true;

		for (let i = 0; i < charCount; i++) {
			if (originalText[i] === " ") {
				charStates[i] = "revealed";
			} else {
				const charDelay = resolveStagger(delayOption, i, charCount, 0);
				charStates[i] = charDelay === 0 ? "scrambling" : "idle";
			}
		}

		startScrambleLoop();

		for (let i = 0; i < charCount; i++) {
			if (originalText[i] === " ") continue;

			const charDelay = resolveStagger(delayOption, i, charCount, 0);
			const charDuration = resolveStagger(duration, i, charCount, 0);

			if (charDelay > 0) {
				const timerId = setTimeout(() => {
					if (!isActive) return;
					charStates[i] = "scrambling";
					if (charDuration !== Number.POSITIVE_INFINITY) {
						scheduleReveal(i, charDuration * 1000);
					}
				}, charDelay * 1000);
				cancelFns[i] = () => clearTimeout(timerId);
			} else if (charDuration !== Number.POSITIVE_INFINITY) {
				scheduleReveal(i, charDuration * 1000);
			}
		}

		updateDisplay();
	}

	function stop() {
		if (!isActive) return;
		isActive = false;

		clearAllTimers();

		for (let i = 0; i < charCount; i++) {
			charStates[i] = "revealed";
		}

		stopScrambleLoop();
		setText(originalText);
		resolveFinished?.();
	}

	function finish() {
		if (!isActive) return;
		isActive = false;

		clearAllTimers();

		let minOffset = Number.POSITIVE_INFINITY;
		for (let i = 0; i < charCount; i++) {
			if (originalText[i] === " ") continue;
			const charDuration = resolveStagger(duration, i, charCount, 0);
			if (charDuration !== Number.POSITIVE_INFINITY) {
				minOffset = Math.min(minOffset, charDuration);
			}
		}
		if (minOffset === Number.POSITIVE_INFINITY) minOffset = 0;

		for (let i = 0; i < charCount; i++) {
			if (originalText[i] === " ") {
				charStates[i] = "revealed";
				continue;
			}

			const charDuration = resolveStagger(duration, i, charCount, 0);
			const relativeOffset = charDuration === Number.POSITIVE_INFINITY ? 0 : charDuration - minOffset;

			if (relativeOffset === 0) {
				charStates[i] = "revealed";
			} else {
				charStates[i] = "scrambling";
				const timerId = setTimeout(() => {
					charStates[i] = "revealed";
					updateDisplay();
					checkComplete();
				}, relativeOffset * 1000);
				cancelFns[i] = () => clearTimeout(timerId);
			}
		}

		const hasScrambling = charStates.some((s) => s === "scrambling");
		if (hasScrambling) {
			startScrambleLoop();
		} else {
			stopScrambleLoop();
		}

		updateDisplay();
		checkComplete();
	}

	play();

	return {
		stop,
		play,
		finish,
		finished,
	};
}
