"use client";

import { StewardUserButton, useAuth } from "@stwd/react";

interface StewardUserMenuProps {
	className?: string;
}

/**
 * Thin wrapper around StewardUserButton styled for waifu.fun header.
 * Returns null when user is not authenticated via Steward.
 */
export function StewardUserMenu({ className }: StewardUserMenuProps) {
	const { isAuthenticated, isLoading } = useAuth();

	if (isLoading || !isAuthenticated) {
		return null;
	}

	const props = {
		showWallet: false as const,
		avatarSize: 28,
		...(className ? { className } : {}),
	};

	return <StewardUserButton {...props} />;
}
