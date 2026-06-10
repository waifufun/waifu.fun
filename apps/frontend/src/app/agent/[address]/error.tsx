"use client";

/**
 * Error boundary for /agent/[address]. Triggers when fetchAgent /
 * fetchTrades / fetchLaunch throw uncaught; the calmer 'not found' state
 * is handled by `not-found.tsx`.
 *
 * The user sees a quiet, branded panel with a retry affordance rather
 * than the raw Next.js stack trace.
 */
import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { SurfaceCard } from "@/components/ui/surface-card";
import { useTranslation } from "@/contexts/locale-context";

export default function AgentRouteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const { t } = useTranslation();
	useEffect(() => {
		// Best-effort log so the error reaches the browser console for
		// dev triage. We don't ship a Sentry-style sink here yet.
		console.error("agent route error", error);
	}, [error]);

	return (
		<main className="flex min-h-[100dvh] items-center justify-center px-6 text-white">
			<SurfaceCard padding="lg" className="w-full max-w-md text-center">
				<div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/40">
					{t("agent.error.eyebrow")}
				</div>
				<h1 className="mt-3 text-2xl tracking-tight md:text-3xl">{t("agent.error.title")}</h1>
				<p className="mx-auto mt-3 max-w-[42ch] text-sm leading-relaxed text-white/55">{t("agent.error.body")}</p>
				{error.digest ? (
					<p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
						{t("agent.error.refPrefix", { digest: error.digest })}
					</p>
				) : null}
				<div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<button
						type="button"
						onClick={reset}
						className="inline-flex h-10 items-center gap-2 rounded-sm border border-[#00ff87]/40 bg-[#00ff87]/[0.06] px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87] transition-colors duration-200 hover:border-[#00ff87]/60 hover:bg-[#00ff87]/[0.1]"
					>
						<RotateCcw className="h-3 w-3" strokeWidth={1.75} />
						{t("agent.error.retry")}
					</button>
					<Link
						href="/agents"
						className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65 transition-colors duration-200 hover:border-white/30 hover:text-white/95"
					>
						<ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
						{t("agent.error.allAgents")}
					</Link>
				</div>
			</SurfaceCard>
		</main>
	);
}
