"use client";

import { EASE_OUT_EXPO } from "@/lib/motion";
import { sanitizeRedirectPath } from "@/lib/url-safety";
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

// Sensitive params we strip from the URL/hash after reading them so a JWT or
// authorization code is never left in the address bar / history / referrer.
const SENSITIVE_PARAMS = ["token", "refreshToken", "code"] as const;

function scrubCallbackUrl() {
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	let changed = false;
	for (const key of SENSITIVE_PARAMS) {
		if (url.searchParams.has(key)) {
			url.searchParams.delete(key);
			changed = true;
		}
	}
	if (url.hash) {
		const hashParams = new URLSearchParams(url.hash.slice(1));
		for (const key of SENSITIVE_PARAMS) {
			if (hashParams.has(key)) {
				hashParams.delete(key);
				changed = true;
			}
		}
		const nextHash = hashParams.toString();
		url.hash = nextHash ? `#${nextHash}` : "";
	}
	if (changed) window.history.replaceState(null, "", url.toString());
}

function CallbackInner() {
	const router = useRouter();
	const params = useSearchParams();
	const ranRef = useRef(false);

	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: ranRef makes this run-once; adding params/router to deps would let the cleanup abort our own in-flight POST after scrubCallbackUrl() mutates the URL.
	useEffect(() => {
		if (ranRef.current) return;
		ranRef.current = true;

		const hashParams =
			typeof window !== "undefined" && window.location.hash.startsWith("#")
				? new URLSearchParams(window.location.hash.slice(1))
				: new URLSearchParams();
		// PKCE authorization-code flow (current): Steward redirects back with
		// `?code=`. The matching `code_verifier` is in the HttpOnly `wf_oauth_pkce`
		// cookie set at /auth/oauth/start, so we POST `{ code }` to the same-origin
		// /api/auth/exchange proxy which swaps it server-side.
		const code = params?.get("code") ?? hashParams.get("code");
		// Legacy implicit flow (fallback): Steward used to emit `?token=&refreshToken=`.
		const token = params?.get("token") ?? hashParams.get("token");
		const refreshToken = params?.get("refreshToken") ?? hashParams.get("refreshToken");
		const errorParam = params?.get("error") ?? hashParams.get("error");
		const errorDescription = params?.get("error_description") ?? hashParams.get("error_description");
		scrubCallbackUrl();

		// Steward (or the provider) returned an error before we even got the code.
		if (errorParam) {
			setPhase("error");
			setError(errorDescription ? `${errorParam}: ${errorDescription}` : errorParam);
			return;
		}

		if (!code && !token) {
			setPhase("error");
			setError("missing authorization code in callback URL");
			return;
		}

		const controller = new AbortController();
		(async () => {
			try {
				// Prefer the PKCE exchange when we have a `code`; fall back to the
				// legacy token finalize otherwise. Both are SAME-ORIGIN proxies that
				// hit api.waifu.fun and mirror Set-Cookie back as a first-party
				// cookie (avoids cross-origin / ITP storage failures).
				const res = code
					? await fetch("/api/auth/exchange", {
							method: "POST",
							credentials: "include",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ code }),
							signal: controller.signal,
						})
					: await fetch("/api/auth/finalize", {
							method: "POST",
							credentials: "include",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ provider: "oauth", token, refreshToken }),
							signal: controller.signal,
						});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as {
						error?: string;
						message?: string;
					} | null;
					throw new Error(body?.message ?? body?.error ?? `http ${res.status}`);
				}
				const json = (await res.json()) as {
					ok: boolean;
					data: {
						return_to: string;
						patron: { stewardUserId: string; email: string | null };
					};
				};
				const returnTo = sanitizeRedirectPath(json?.data?.return_to);

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
	}, []);

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
