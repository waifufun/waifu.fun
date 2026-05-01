"use client";

import { AuthGateLoader } from "@/components/auth/auth-gate-loader";
import { useAuthRequired } from "@/hooks/use-auth-required";
import { type ReactNode, Suspense } from "react";

/**
 * Client-side auth gate that wraps a protected page tree.
 *
 * Pair with the W9.9 middleware: middleware catches the initial
 * navigation, this catches in-page session expiry. Renders an
 * AuthGateLoader during hydration / loading, redirects on
 * unauthenticated, and reveals children only when authenticated.
 *
 * Use from a server-component layout:
 *   <ProtectedShell>{children}</ProtectedShell>
 */
function Gate({ children }: { children: ReactNode }) {
	const { isLoading, isAuthenticated } = useAuthRequired();
	if (isLoading) return <AuthGateLoader />;
	if (!isAuthenticated) return null;
	return <>{children}</>;
}

export function ProtectedShell({ children }: { children: ReactNode }) {
	return (
		<Suspense fallback={<AuthGateLoader />}>
			<Gate>{children}</Gate>
		</Suspense>
	);
}
