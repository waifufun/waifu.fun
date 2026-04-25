"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { STEWARD_LOCAL_TOKEN_KEY, STEWARD_LOCAL_USER_KEY, useStewardStatus } from "@/lib/api/steward";

type Phase = "idle" | "linking" | "success" | "error";

function StewardCallbackInner() {
	const router = useRouter();
	const params = useSearchParams();
	const { link } = useStewardStatus();

	const [phase, setPhase] = useState<Phase>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [usedFallback, setUsedFallback] = useState(false);
	const ranRef = useRef(false);

	const token = params.get("token") ?? params.get("code");
	const stewardUserId = params.get("user_id") ?? params.get("uid");
	const errorParam = params.get("error");
	const errorDescription = params.get("error_description");

	useEffect(() => {
		if (ranRef.current) return;
		ranRef.current = true;

		// Steward returned an error → do NOT close the window.
		if (errorParam) {
			setPhase("error");
			setErrorMessage(errorDescription ?? errorParam);
			return;
		}

		if (!token) {
			setPhase("error");
			setErrorMessage("Steward redirect did not include a token. Try again.");
			return;
		}

		const isPopup = typeof window !== "undefined" && Boolean(window.opener) && window.opener !== window;

		setPhase("linking");
		void link
			.mutateAsync({ stewardToken: token, stewardUserId: stewardUserId ?? undefined })
			.then((result) => {
				// Mutation already wrote localStorage on 404, but if we got a real
				// 200 the cache is updated and we don't need fallback storage.
				const fellBack =
					typeof window !== "undefined" && window.localStorage.getItem(STEWARD_LOCAL_TOKEN_KEY) === token;
				setUsedFallback(fellBack);
				setPhase("success");

				const message = {
					type: "steward.connected" as const,
					userId: result.stewardUserId ?? stewardUserId ?? null,
					email: result.email ?? null,
				};

				if (isPopup) {
					try {
						window.opener?.postMessage(message, "*");
					} catch {
						// ignore — opener may be cross-origin in odd configs
					}
					// Give the parent a beat to react before tearing down.
					window.setTimeout(() => window.close(), 250);
				} else {
					window.setTimeout(() => router.replace("/patron?steward=connected"), 600);
				}
			})
			.catch((err: unknown) => {
				// On link failure, fall back to localStorage so the patron isn't
				// stranded — the badge will treat them as connected via fallback.
				if (typeof window !== "undefined") {
					try {
						window.localStorage.setItem(STEWARD_LOCAL_TOKEN_KEY, token);
						if (stewardUserId) {
							window.localStorage.setItem(STEWARD_LOCAL_USER_KEY, stewardUserId);
						}
					} catch {
						// ignore quota / private-mode errors
					}
				}
				setUsedFallback(true);
				setErrorMessage(err instanceof Error ? err.message : "Could not contact waifu.fun backend.");
				setPhase("error");
			});
	}, [errorDescription, errorParam, link, router, stewardUserId, token]);

	const retry = () => {
		setPhase("idle");
		setErrorMessage(null);
		ranRef.current = false;
		// Force the effect to re-run on the next paint.
		window.setTimeout(() => {
			ranRef.current = false;
			setPhase("linking");
			window.location.reload();
		}, 50);
	};

	return (
		<main className="relative min-h-[100dvh] bg-[#050507] text-white antialiased flex items-center justify-center px-4 py-16">
			<div
				aria-hidden="true"
				className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
				style={{
					backgroundImage:
						"radial-gradient(circle at 30% 20%, rgba(0,255,135,0.6), transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,255,135,0.3), transparent 60%)",
				}}
			/>
			<div className="relative z-10 w-full max-w-md">
				<div className="mb-8">
					<Link
						href="/patron"
						className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300 transition-colors"
					>
						<ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
						Back to patron
					</Link>
				</div>

				<div className="rounded-xl border border-white/10 bg-[#0a0a0c] p-7 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.7)]">
					<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-4">
						waifu.fun / steward / callback
					</div>

					{phase === "linking" || phase === "idle" ? (
						<div className="flex flex-col items-start gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-black/40 text-[#00ff87]">
								<Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
							</div>
							<h1 className="text-xl font-medium text-white tracking-tight">Linking your Steward account</h1>
							<p className="text-sm text-neutral-400 leading-relaxed">
								Verifying the token Steward sent us. This usually takes a second.
							</p>
						</div>
					) : null}

					{phase === "success" ? (
						<div className="flex flex-col items-start gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]">
								<CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
							</div>
							<h1 className="text-xl font-medium text-white tracking-tight">Steward connected</h1>
							<p className="text-sm text-neutral-400 leading-relaxed">
								{usedFallback
									? "Stored locally. We'll sync to the backend automatically once it's wired up."
									: "Your wallet is linked to your Steward account."}
							</p>
							<p className="text-xs text-neutral-500 mt-2">
								Closing this window automatically. If it doesn't,{" "}
								<button
									type="button"
									onClick={() => {
										if (window.opener) window.close();
										else router.replace("/patron");
									}}
									className="underline underline-offset-4 hover:text-neutral-300"
								>
									click here
								</button>
								.
							</p>
						</div>
					) : null}

					{phase === "error" ? (
						<div className="flex flex-col items-start gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md border border-rose-400/30 bg-rose-400/10 text-rose-300">
								<AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
							</div>
							<h1 className="text-xl font-medium text-white tracking-tight">Steward connect failed</h1>
							<p className="text-sm text-neutral-300 leading-relaxed font-mono break-words">
								{errorMessage ?? "Unknown error."}
							</p>
							<div className="mt-3 flex flex-col sm:flex-row gap-2 w-full">
								<button
									type="button"
									onClick={retry}
									className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#00ff87]/40 bg-[#00ff87]/10 px-4 py-2 text-xs font-medium text-[#bff7d6] hover:bg-[#00ff87]/15 transition-colors"
								>
									<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
									Try again
								</button>
								<Link
									href="/patron"
									className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-white/5 transition-colors"
								>
									Back to patron
								</Link>
							</div>
						</div>
					) : null}
				</div>

				<p className="mt-5 text-center text-[11px] text-neutral-600 leading-relaxed">
					Source: <span className="font-mono text-neutral-500">eliza.steward.dev</span>
				</p>
			</div>
		</main>
	);
}

export default function StewardCallbackPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-[100dvh] items-center justify-center bg-[#050507] text-neutral-400">
					<Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
				</div>
			}
		>
			<StewardCallbackInner />
		</Suspense>
	);
}
