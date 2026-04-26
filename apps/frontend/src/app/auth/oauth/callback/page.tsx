"use client";

import { EASE_OUT_EXPO } from "@/lib/motion";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Steward OAuth callback (W9.5).
 *
 * Steward 302s the user back here after the provider OAuth dance with the
 * issued JWT + the state we bound at /auth/oauth/start. We forward both to
 * our backend's POST /auth/oauth/finalize, which re-verifies the JWT,
 * upserts the patron row, and binds the long-lived wf_session cookie under
 * api.waifu.fun.
 *
 * Two callers are supported:
 *   - direct redirect: navigate the current tab to `data.return_to` on success
 *   - popup flow: postMessage the opener and self-close
 */

type Phase = "loading" | "error";

function CallbackInner() {
	const router = useRouter();
	const params = useSearchParams();
	const ranRef = useRef(false);

	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (ranRef.current) return;
		ranRef.current = true;

		const token = params.get("token");
		const state = params.get("state");
		const errorParam = params.get("error");
		const errorDescription = params.get("error_description");

		// Steward (or the provider) returned an error before we even got the JWT.
		if (errorParam) {
			setPhase("error");
			setError(errorDescription ? `${errorParam}: ${errorDescription}` : errorParam);
			return;
		}

		if (!token || !state) {
			setPhase("error");
			setError("missing token or state in callback URL");
			return;
		}

		const controller = new AbortController();
		(async () => {
			try {
				// POST to SAME-ORIGIN /api/auth/finalize Next.js route which
				// proxies to api.waifu.fun and mirrors Set-Cookie back as a
				// first-party cookie. Avoids cross-origin storage failures.
				const res = await fetch("/api/auth/finalize", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ provider: "oauth", token, state }),
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
				const returnTo = json?.data?.return_to ?? "/patron";

				// Popup-flow: notify the opener and self-close. Otherwise redirect.
				if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
					try {
						window.opener.postMessage(
							{ type: "waifu.oauth.success", patron: json.data.patron },
							window.location.origin,
						);
					} catch {
						// postMessage can fail across origin boundaries; fall back to redirect.
					}
					window.close();
					// If close() is blocked (some browsers refuse to close non-script-opened
					// windows), still navigate so the user is not stranded.
					if (typeof window !== "undefined") {
						window.location.assign(returnTo);
					} else {
						router.replace(returnTo);
					}
					return;
				}

				// Full page navigation, not client-side. Guarantees browser sends
				// the freshly-set wf_session cookie on the next request so the
				// middleware on /patron etc. sees it.
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
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">waifu.fun / auth / callback</p>
				{phase === "loading" ? (
					<>
						<h1 className="text-2xl font-medium text-[#e4e4e7] tracking-tight">signing you in</h1>
						<p className="text-sm text-[#a1a1aa] leading-relaxed">verifying with steward.</p>
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
							onClick={() => router.replace("/auth/connect")}
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

export default function OAuthCallbackPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] text-[#71717a] text-sm">
					loading
				</div>
			}
		>
			<CallbackInner />
		</Suspense>
	);
}
