// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import type { Em } from "../types";

export function getWidthInEm(element: HTMLElement): Em {
	const { width, fontSize } = getComputedStyle(element);
	return `${Number.parseFloat(width) / Number.parseFloat(fontSize)}em`;
}
