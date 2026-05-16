"use client";

import { EASE_OUT_EXPO } from "@/lib/motion";
import { sanitizeRedirectPath } from "@/lib/url-safety";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

type Phase = "loading" | "error";

function TwitterFinalizeInner() {
	const router = useRouter();
	const params = useSearchParams();
	const ranRef = useRef(false);
	const [phase, setPhase] = useState<Phase>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (ranRef.current) return;
		ranRef.current = true;

		const token = params.get("token");
		const returnTo = sanitizeRedirectPath(params.get("return_to"));
		const errorParam = params.get("error") ?? params.get("auth_error");
		if (errorParam) {
			setPhase("error");
			setError(errorParam);
			return;
		}
		if (!token) {
			setPhase("error");
			setError("missing token in twitter callback URL");
			return;
		}

		const controller = new AbortController();
		(async () => {
			try {
				const res = await fetch("/api/auth/finalize", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ provider: "twitter", token, return_to: returnTo }),
					signal: controller.signal,
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
					throw new Error(body?.message ?? body?.error ?? `http ${res.status}`);
				}
				const json = (await res.json()) as { ok: boolean; data?: { return_to?: string } };
				window.location.assign(sanitizeRedirectPath(json.data?.return_to, returnTo));
			} catch (err) {
				if ((err as { name?: string })?.name === "AbortError") return;
				setPhase("error");
				setError(err instanceof Error ? err.message : "twitter sign-in failed");
			}
		})();

		return () => controller.abort();
	}, [params]);

	return (
		<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] px-6">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
				className="w-full max-w-md space-y-6"
			>
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">waifu.fun / auth / twitter</p>
				{phase === "loading" ? (
					<>
						<h1 className="text-2xl font-medium text-[#e4e4e7] tracking-tight">signing you in</h1>
						<p className="text-sm text-[#a1a1aa] leading-relaxed">finishing twitter / x auth.</p>
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

export default function TwitterFinalizePage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] text-[#71717a] text-sm">
					loading
				</div>
			}
		>
			<TwitterFinalizeInner />
		</Suspense>
	);
}
