"use client";

import { useTranslation } from "@/contexts/locale-context";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Legacy email-callback redirect.
 *
 * Older magic-link emails pointed at /auth/callback?token=...&email=...
 * Current flow uses /auth/email/verify (set as the magicLinkBaseUrl
 * callback path in Steward tenant config). Forward any stragglers.
 */
export default function LegacyEmailCallback() {
	const { t } = useTranslation();
	const router = useRouter();
	const params = useSearchParams();

	useEffect(() => {
		const search = params?.toString() ?? "";
		const target = search ? `/auth/email/verify?${search}` : "/";
		router.replace(target);
	}, [params, router]);

	return (
		<div className="min-h-[60vh] flex items-center justify-center text-sm text-[#71717a]">
			{t("auth.callback.redirecting")}
		</div>
	);
}
