"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@stwd/react";

/**
 * In-page auth gate.
 *
 * The Next.js middleware (W9.9) catches anonymous navigations to
 * /create/* and /patron/*, but it can't catch a session that expires
 * while the user is sitting on a page (the cookie's gone but the
 * Steward auth context still hydrates as "loading" then "anonymous").
 *
 * Drop this hook into client-rendered protected pages to handle the
 * in-page case: when isLoading flips false and isAuthenticated is
 * still false, we redirect to /?signin=1&return_to=<pathname>, which
 * matches the middleware shape so the homepage auto-opens the modal
 * and the user lands back here after re-auth.
 *
 * Usage:
 *   const { isLoading, isAuthenticated } = useAuthRequired();
 *   if (isLoading) return <AuthGateLoader />;
 *   if (!isAuthenticated) return null; // redirect in flight
 */
export function useAuthRequired(): { isAuthenticated: boolean; isLoading: boolean } {
	const { isAuthenticated, isLoading } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	useEffect(() => {
		if (isLoading) return;
		if (isAuthenticated) return;
		// If we're already on the homepage with the modal opening, don't
		// loop into another redirect.
		if (pathname === "/" && params?.get("signin") === "1") return;
		const target = pathname || "/";
		const url = `/?signin=1&return_to=${encodeURIComponent(target)}`;
		router.replace(url);
	}, [isAuthenticated, isLoading, pathname, params, router]);

	return { isAuthenticated, isLoading };
}
