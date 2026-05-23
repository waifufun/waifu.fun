// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus-dom@2.11.3

export function needsBackspace(currentText: string, fullText: string) {
	return currentText.length > fullText.length || (currentText.length > 0 && !fullText.startsWith(currentText));
}
