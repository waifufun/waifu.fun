// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus-dom@2.11.3

export function findPreviousWordIndex(text: string, fromIndex: number) {
	let i = fromIndex - 1;

	while (i >= 0 && /\s/.test(text[i] ?? "")) {
		i--;
	}

	while (i >= 0 && !/\s/.test(text[i] ?? "")) {
		i--;
	}

	return Math.max(0, i + 1);
}
