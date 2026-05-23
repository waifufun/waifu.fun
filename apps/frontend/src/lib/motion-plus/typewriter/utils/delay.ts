// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus-dom@2.11.3

import { needsBackspace } from "./needs-backspace";

function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Compute the delay before typing the next character in the text. */
export function getTypewriterDelay(
	fullText: string,
	currentText: string,
	interval: number,
	variance: number | "natural",
	backspaceFactor: number,
): number {
	if (needsBackspace(currentText, fullText)) {
		return interval * backspaceFactor;
	}

	if (variance === "natural") {
		return getNaturalDelay(fullText, currentText, interval);
	}

	if (typeof variance === "number" && variance > 0) {
		const varianceAmount = interval * (variance / 100);
		return interval + mix(-varianceAmount, varianceAmount, Math.random());
	}

	return interval;
}

function getNaturalDelay(fullText: string, currentText: string, interval: number): number {
	const currentIndex = currentText.length;
	const char = fullText[currentIndex];
	const previousChar = fullText[currentIndex - 1];

	if (!char) return interval;

	const beforeText = fullText.slice(0, currentIndex);
	const lastSpaceIndex = beforeText.lastIndexOf(" ");
	const positionInWord = currentIndex - lastSpaceIndex - 1;

	const wordStart = lastSpaceIndex + 1;
	const afterCurrentIndex = fullText.slice(currentIndex);
	const nextSpaceIndex = afterCurrentIndex.indexOf(" ");
	const wordEnd = nextSpaceIndex === -1 ? fullText.length : currentIndex + nextSpaceIndex;
	const wordLength = wordEnd - wordStart;

	let delayMultiplier = 1.0;

	if (previousChar && /[.!?]/.test(previousChar) && char === " ") {
		delayMultiplier *= 3;
	}

	if (wordLength <= 3) {
		delayMultiplier *= 0.7;
	} else {
		if (positionInWord === 0 && char !== " ") {
			delayMultiplier *= 1.5;
		}
		if (positionInWord === wordLength - 1) {
			delayMultiplier *= 1.4;
		}
	}

	if (positionInWord > 0 && positionInWord < wordLength - 1 && wordLength > 3) {
		const middleBoost = Math.min(positionInWord / wordLength, 0.4);
		delayMultiplier *= 1.0 - middleBoost;
	}

	if (punctuation.has(char)) {
		delayMultiplier *= 1.5;
	}

	if (shiftRequired.has(char)) {
		delayMultiplier *= 1.5;
	}

	if (/\d/.test(char)) {
		delayMultiplier *= 1.3;
	}

	if (wordLength > 8) {
		delayMultiplier *= 1.3;
	}

	if (char !== char.toLowerCase()) {
		delayMultiplier *= 1.25;
	}

	const fatigueThreshold = 200;
	if (currentIndex > fatigueThreshold) {
		const fatigueAmount = Math.min((currentIndex - fatigueThreshold) / 1000, 0.3);
		delayMultiplier *= 1.0 + fatigueAmount;
	}

	const randomVariance = mix(-0.25, 0.25, Math.random());
	delayMultiplier *= 1.0 + randomVariance;

	const finalDelay = interval * delayMultiplier;

	return Math.max(interval * 0.2, finalDelay);
}

const punctuation = new Set([".", ",", "!", "?", ":", ";", "'", '"', "-", "(", ")"]);

const shiftRequired = new Set([
	"!",
	"@",
	"#",
	"$",
	"%",
	"^",
	"&",
	"*",
	"(",
	")",
	"_",
	"+",
	"{",
	"}",
	"|",
	":",
	'"',
	"<",
	">",
	"?",
]);
