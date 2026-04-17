"use client";

import { StewardOAuthCallback } from "@stwd/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function OAuthCallbackInner() {
	const router = useRouter();
	const params = useSearchParams();
	const provider = params.get("provider") ?? "google";

	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<StewardOAuthCallback
				provider={provider}
				onSuccess={() => router.push("/")}
				onError={(err) => {
					console.error("[oauth-callback]", err);
					router.push("/");
				}}
				redirectTo="/"
			/>
		</div>
	);
}

/**
 * OAuth redirect callback page.
 * Handles Google, Discord, etc. redirects from Steward.
 */
export default function OAuthCallbackPage() {
	return (
		<Suspense
			fallback={<div className="flex min-h-[60vh] items-center justify-center text-[#71717a]">Verifying...</div>}
		>
			<OAuthCallbackInner />
		</Suspense>
	);
}
