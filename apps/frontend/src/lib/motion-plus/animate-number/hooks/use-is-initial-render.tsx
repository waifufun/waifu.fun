// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import { useEffect, useRef } from "react";

export function useIsInitialRender() {
	const isInitialRender = useRef(true);

	useEffect(() => {
		isInitialRender.current = false;
	}, []);

	return isInitialRender.current;
}
