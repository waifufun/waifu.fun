"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { type PatronUser, logout as apiLogout, fetchMe, redirectToXLogin } from "@/lib/auth-api";

interface AuthContextValue {
	/** Patron user from X OAuth session. null = not logged in. undefined = loading. */
	patronUser: PatronUser | null | undefined;
	isLoading: boolean;
	/** Redirect to X OAuth. */
	loginWithX: () => void;
	/** Logout and clear local state. */
	logout: () => Promise<void>;
	/** Re-check the session (e.g. after callback redirect). */
	refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [patronUser, setPatronUser] = useState<PatronUser | null | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(true);

	const refetch = useCallback(async () => {
		setIsLoading(true);
		const user = await fetchMe();
		setPatronUser(user);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		refetch();
	}, [refetch]);

	const loginWithX = useCallback(() => {
		redirectToXLogin();
	}, []);

	const logout = useCallback(async () => {
		await apiLogout();
		setPatronUser(null);
	}, []);

	// loginWithX/logout/refetch are useCallback-stable; memoizing keeps the
	// app-wide provider from re-rendering every usePatronAuth consumer whenever
	// an unrelated parent above it re-renders.
	const value = useMemo(
		() => ({ patronUser, isLoading, loginWithX, logout, refetch }),
		[patronUser, isLoading, loginWithX, logout, refetch],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePatronAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("usePatronAuth must be used within <AuthProvider>");
	}
	return ctx;
}
