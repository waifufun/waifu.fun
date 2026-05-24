"use client";

import { useTranslation } from "@/contexts/locale-context";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { sanitizeRedirectPath } from "@/lib/url-safety";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Email magic-link landing page (W9.11).
 */

type Phase = "loading" | "error";

function scrubCallbackUrl() {
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	let changed = false;
	for (const key of ["token", "email"]) {
		if (url.searchParams.has(key)) {
			url.searchParams.delete(key);
			changed = true;
		}
	}
	if (changed) window.history.replaceState(null, "", url.toString());
}

function VerifyInner() {
	const { t } = useTranslation();
	const router = useRouter();
	const params = useSearchParams();
	const ranRef = useRef(false);

	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: ranRef makes this run-once; adding params/router to deps would let the cleanup abort our own in-flight POST after scrubCallbackUrl() mutates the URL.
	useEffect(() => {
		if (ranRef.current) return;
		ranRef.current = true;

		const token = params?.get("token");
		const email = params?.get("email");
		scrubCallbackUrl();

		if (!token || !email) {
			setPhase("error");
			setError(t("auth.emailVerify.missingTokenError"));
			return;
		}

		const controller = new AbortController();
		(async () => {
			try {
				const res = await fetch("/api/auth/finalize", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ provider: "email", token, email }),
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
				if (typeof window !== "undefined") {
					window.location.assign(returnTo);
				} else {
					router.replace(returnTo);
				}
			} catch (err) {
				if ((err as { name?: string })?.name === "AbortError") return;
				setPhase("error");
				setError(err instanceof Error ? err.message : t("auth.emailVerify.signInFailedFallback"));
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
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
					{t("auth.emailVerify.eyebrow")}
				</p>
				{phase === "loading" ? (
					<>
						<h1 className="text-2xl font-medium text-[#e4e4e7] tracking-tight">{t("auth.emailVerify.signingIn")}</h1>
						<p className="text-sm text-[#a1a1aa] leading-relaxed">{t("auth.emailVerify.verifyingMagicLink")}</p>
						<div
							className="h-px bg-gradient-to-r from-[#00ff87]/40 via-[#00ff87]/10 to-transparent"
							aria-hidden="true"
						/>
					</>
				) : (
					<>
						<h1 className="text-2xl font-medium text-[#f87171] tracking-tight">{t("auth.emailVerify.signInFailed")}</h1>
						<p className="text-sm text-[#a1a1aa] leading-relaxed font-mono">
							{error ?? t("auth.emailVerify.unknownError")}
						</p>
						<button
							type="button"
							onClick={() => router.replace("/?signin=1")}
							className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#00ff87] border border-[#00ff87]/30 px-4 py-2 rounded-sm hover:bg-[#00ff87]/10 transition-colors duration-200"
						>
							{t("auth.emailVerify.tryAgain")}
						</button>
					</>
				)}
			</motion.div>
		</div>
	);
}

function VerifyFallback() {
	const { t } = useTranslation();
	return (
		<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] text-[#71717a] text-sm">
			{t("auth.emailVerify.loading")}
		</div>
	);
}

export default function EmailVerifyPage() {
	return (
		<Suspense fallback={<VerifyFallback />}>
			<VerifyInner />
		</Suspense>
	);
}
