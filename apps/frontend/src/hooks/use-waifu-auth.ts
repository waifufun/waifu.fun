"use client";

import { useEffect, useState } from "react";

/**
 * Reads our authoritative auth state from the `wf_authed` cookie that
 * /api/auth/finalize sets alongside the HttpOnly `wf_session` cookie.
 *
 * The actual JWT lives in `wf_session` (HttpOnly so JS can't read it).
 * `wf_authed=1` is a frontend-readable presence flag with the same TTL
 * that lets the UI know whether the user is logged in.
 *
 * @stwd/react's `useAuth()` was checking Steward's own localStorage-
 * based session, which doesn't match our cookie-based flow. Use this
 * hook instead anywhere on the frontend that needs to know "is the
 * user logged in via waifu.fun's auth flow?".
 */
export function useWaifuAuth(): { isAuthenticated: boolean; isLoading: boolean } {
	const [hydrated, setHydrated] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	useEffect(() => {
		const check = () => {
			if (typeof document === "undefined") return;
			const authed = document.cookie.split(";").some((c) => c.trim().startsWith("wf_authed=1"));
			setIsAuthenticated(authed);
		};
		check();
		setHydrated(true);
		// Re-check on focus + storage events so a sign-in/out in another
		// tab is reflected here.
		const onFocus = () => check();
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, []);

	return { isAuthenticated, isLoading: !hydrated };
}
