"use client";

import { useAuth as useStwdAuth } from "@stwd/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Client-side auth gate for protected pages (W9.9).
 *
 * Server-side middleware already redirects anonymous users on initial
 * navigation. This hook handles the in-page failure mode: a session that
 * expires while the user has the tab open, or a Steward provider that
 * never resolves an authenticated state for whatever reason. When that
 * happens we replace the URL with /auth/connect?return_to=<current> so
 * the user lands back here after re-auth.
 *
 * Returns the same shape as @stwd/react's useAuth so the calling page can
 * branch on isLoading vs isAuthenticated for skeleton rendering.
 */
export function useAuthRequired() {
	const { isAuthenticated, isLoading } = useStwdAuth();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (isLoading) return;
		if (isAuthenticated) return;
		const returnTo = encodeURIComponent(pathname || "/");
		router.replace(`/auth/connect?return_to=${returnTo}`);
	}, [isAuthenticated, isLoading, pathname, router]);

	return { isAuthenticated, isLoading };
}
