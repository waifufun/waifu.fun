"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * In-page auth gate.
 *
 * The Next.js middleware (W9.9) catches anonymous navigations to
 * /create/* and /patron/*, but it can't catch a session that expires
 * while the user is sitting on a page.
 *
 * Auth detection: reads the `wf_authed` cookie (set as a non-HttpOnly
 * flag alongside the HttpOnly `wf_session` cookie by /api/auth/finalize).
 * The actual JWT stays HttpOnly; this is just a frontend-readable
 * "is the user logged in" flag.
 *
 * @stwd/react's useAuth() is NOT used here because it tracks Steward's
 * own localStorage-based session, not our HttpOnly-cookie-based one.
 */
function readAuthedCookie(): boolean {
	if (typeof document === "undefined") return false;
	return document.cookie.split(";").some((c) => c.trim().startsWith("wf_authed=1"));
}

export function useAuthRequired(): { isAuthenticated: boolean; isLoading: boolean } {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const [hydrated, setHydrated] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);

	// Read the cookie on mount. document.cookie isn't available SSR.
	useEffect(() => {
		setIsAuthenticated(readAuthedCookie());
		setHydrated(true);
	}, []);

	useEffect(() => {
		if (!hydrated) return;
		if (isAuthenticated) return;
		// If we're already on the homepage with the modal opening, don't
		// loop into another redirect.
		if (pathname === "/" && params?.get("signin") === "1") return;
		const target = pathname || "/";
		const url = `/?signin=1&return_to=${encodeURIComponent(target)}`;
		router.replace(url);
	}, [hydrated, isAuthenticated, pathname, params, router]);

	return { isAuthenticated, isLoading: !hydrated };
}
