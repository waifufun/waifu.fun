"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useWaifuAuth } from "./use-waifu-auth";

/**
 * In-page auth gate.
 *
 * The Next.js middleware (W9.9) catches anonymous navigations to
 * /create/* and /patron/*, but it can't catch a session that expires
 * while the user is sitting on a page.
 *
 * Auth detection: useWaifuAuth always calls /v3/patron/me on mount; the
 * authenticated state becomes true only after that backend session check
 * succeeds. The cosmetic `wf_authed` cookie is no longer consulted because
 * mobile WebViews (zerion, MM mobile) don't expose stored cookies via
 * `document.cookie` even when the HttpOnly `wf_session` cookie is intact
 * and sent on requests. The actual JWT stays in the HttpOnly `wf_session`
 * cookie.
 *
 * @stwd/react's useAuth() is NOT used here because it tracks Steward's
 * own localStorage-based session, not our HttpOnly-cookie-based one.
 */
export function useAuthRequired(): { isAuthenticated: boolean; isLoading: boolean } {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const { isAuthenticated, isLoading } = useWaifuAuth();

	useEffect(() => {
		if (isLoading) return;
		if (isAuthenticated) return;
		// If we're already on the homepage with the modal opening, don't
		// loop into another redirect.
		if (pathname === "/" && params?.get("signin") === "1") return;
		const target = pathname || "/";
		const url = `/?signin=1&return_to=${encodeURIComponent(target)}`;
		router.replace(url);
	}, [isLoading, isAuthenticated, pathname, params, router]);

	return { isAuthenticated, isLoading };
}
