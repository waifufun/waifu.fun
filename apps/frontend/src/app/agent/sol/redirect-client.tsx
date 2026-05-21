"use client";

import { useEffect } from "react";

/**
 * Client-side belt-and-braces for the /agent/sol redirect. Triggers after
 * hydration in case the meta-refresh and the inline script both fail.
 */
export function SolAgentRedirectClient({ target }: { target: string }) {
	useEffect(() => {
		// Avoid loops if we somehow ended up back here from the same path.
		if (typeof window === "undefined") return;
		if (window.location.pathname === target) return;
		window.location.replace(target);
	}, [target]);
	return null;
}
