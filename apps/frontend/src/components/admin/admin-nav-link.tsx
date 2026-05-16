"use client";

import { ADMIN_TOKEN_KEY, getAdminToken } from "@/lib/api/admin";
import Link from "next/link";
import { useEffect, useState } from "react";

const TOKEN_EVENT = "waifu-admin-token-change";

/**
 * Header link that surfaces the W5.7 admin ops dashboard only when an
 * operator token is stored locally. Not internationalised; this is an
 * internal tools entry point, not a marketing surface.
 */
export default function AdminNavLink({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
	const [hasToken, setHasToken] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		setHasToken(Boolean(getAdminToken()));

		const handleChange = () => setHasToken(Boolean(getAdminToken()));
		const handleStorage = (e: StorageEvent) => {
			if (e.key === ADMIN_TOKEN_KEY) setHasToken(Boolean(getAdminToken()));
		};
		window.addEventListener(TOKEN_EVENT, handleChange);
		window.addEventListener("storage", handleStorage);
		return () => {
			window.removeEventListener(TOKEN_EVENT, handleChange);
			window.removeEventListener("storage", handleStorage);
		};
	}, []);

	if (!mounted || !hasToken) return null;

	return (
		<Link
			href="/admin/ops"
			className={
				className ?? "text-sm font-mono uppercase tracking-wider text-red-300 hover:text-white transition-colors"
			}
			onClick={() => {
				onNavigate?.();
			}}
			aria-label="Admin operations dashboard"
		>
			admin
		</Link>
	);
}
