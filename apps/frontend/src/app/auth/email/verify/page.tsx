"use client";

import { EASE_OUT_EXPO } from "@/lib/motion";
import { sanitizeRedirectPath } from "@/lib/url-safety";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Email magic-link landing page (W9.11).
 *
 * Steward sends a magic-link email pointing at this URL with `token` and
 * `email` query params. We POST both to our backend's
 * /auth/email/finalize, which:
 *   - forwards them to Steward POST /auth/email/verify
 *   - on success, mints the wf_session cookie under api.waifu.fun
 *   - returns the patron + the return_to path stashed by /auth/email/start
 *
 * On success: navigate to return_to.
 * On failure: show the error with a "try again" button back to /auth/connect.
 */

type Phase = "loading" | "error";

function VerifyInner() {
	const router = useRouter();
	const params = useSearchParams();
	const ranRef = useRef(false);

	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (ranRef.current) return;
		ranRef.current = true;

		const token = params.get("token");
		const email = params.get("email");

		if (!token || !email) {
			setPhase("error");
			setError("missing token or email in callback URL");
			return;
		}

		const controller = new AbortController();
		(async () => {
			try {
				// POST to a SAME-ORIGIN /api/auth/finalize Next.js route that
				// proxies to api.waifu.fun and mirrors Set-Cookie back as a
				// first-party cookie. Cross-origin cookie storage was failing
				// in some browsers (Safari ITP, strict cookie policies) even
				// with credentials:include + ACAC:true.
				const res = await fetch("/api/auth/finalize", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ provider: "email", token, email }),
					signal: controller.signal,
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
					throw new Error(body?.message ?? body?.error ?? `http ${res.status}`);
				}
				const json = (await res.json()) as {
					ok: boolean;
					data: { return_to: string; patron: { stewardUserId: string; email: string | null } };
				};
				const returnTo = sanitizeRedirectPath(json?.data?.return_to);
				// Use window.location.assign for a FULL page navigation rather than
				// router.replace's client-side nav. The full nav guarantees the
				// browser sends the freshly-set wf_session cookie on the next
				// request to /patron, so middleware sees it and doesn't bounce
				// us back to /?signin=1. Avoids a subtle race some browsers hit
				// where the SPA navigation happens before the cookie is committed.
				if (typeof window !== "undefined") {
					window.location.assign(returnTo);
				} else {
					router.replace(returnTo);
				}
			} catch (err) {
				if ((err as { name?: string })?.name === "AbortError") return;
				setPhase("error");
				setError(err instanceof Error ? err.message : "sign-in failed");
			}
		})();

		return () => controller.abort();
	}, [params, router]);

	return (
		<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] px-6">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
				className="w-full max-w-md space-y-6"
			>
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">waifu.fun / auth / email</p>
				{phase === "loading" ? (
					<>
						<h1 className="text-2xl font-medium text-[#e4e4e7] tracking-tight">signing you in</h1>
						<p className="text-sm text-[#a1a1aa] leading-relaxed">verifying your magic link.</p>
						<div
							className="h-px bg-gradient-to-r from-[#00ff87]/40 via-[#00ff87]/10 to-transparent"
							aria-hidden="true"
						/>
					</>
				) : (
					<>
						<h1 className="text-2xl font-medium text-[#f87171] tracking-tight">sign-in failed</h1>
						<p className="text-sm text-[#a1a1aa] leading-relaxed font-mono">{error ?? "unknown error"}</p>
						<button
							type="button"
							onClick={() => router.replace("/?signin=1")}
							className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00ff87] border border-[#00ff87]/30 px-4 py-2 rounded-sm hover:bg-[#00ff87]/10 transition-colors duration-200"
						>
							try again
						</button>
					</>
				)}
			</motion.div>
		</div>
	);
}

export default function EmailVerifyPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] text-[#71717a] text-sm">
					loading
				</div>
			}
		>
			<VerifyInner />
		</Suspense>
	);
}
