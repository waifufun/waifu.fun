"use client";

/**
 * Error boundary for /patron/[agentId]. Before this existed, any uncaught
 * throw in a child (a data-shape mismatch, an owner-only feed returning an
 * unexpected payload, a null field dereferenced during render) unmounted
 * the whole route and the patron saw the bare Next.js "Application error:
 * a client-side exception has occurred" white screen with nothing to act on.
 *
 * Now the patron gets a quiet branded panel with retry + back, AND the real
 * error message/digest is surfaced (with a copy affordance) so a broken feed
 * is diagnosable in-page instead of console-only. The sibling agent route
 * already had this; the patron route was missing it.
 */
import { ArrowLeft, Check, Copy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SurfaceCard } from "@/components/ui/surface-card";

export default function PatronRouteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		console.error("patron route error", error);
	}, [error]);

	const detail = [error.message, error.digest ? `digest ${error.digest}` : null, error.stack]
		.filter(Boolean)
		.join("\n");

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(detail);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			// clipboard can be unavailable; the message is still visible below.
		}
	};

	return (
		<main className="flex min-h-[100dvh] items-center justify-center px-6 text-white">
			<SurfaceCard padding="lg" className="w-full max-w-md text-center">
				<div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/40">patron / error</div>
				<h1 className="mt-3 text-2xl tracking-tight md:text-3xl">this panel hit a snag</h1>
				<p className="mx-auto mt-3 max-w-[42ch] text-sm leading-relaxed text-white/55">
					the agent loaded but one of the owner feeds (policy, runtime, activity) returned something the page
					didn&apos;t expect. retry usually clears it. if it keeps happening, the message below is the cause.
				</p>
				{error.message ? (
					<div className="mt-4 rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-left">
						<p className="break-words font-mono text-[11px] leading-relaxed text-[var(--negative)]">
							{error.message}
						</p>
						{error.digest ? (
							<p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
								ref {error.digest}
							</p>
						) : null}
					</div>
				) : null}
				<div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<button
						type="button"
						onClick={reset}
						className="inline-flex h-10 items-center gap-2 rounded-sm border border-[#00ff87]/40 bg-[#00ff87]/[0.06] px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87] transition-colors duration-200 hover:border-[#00ff87]/60 hover:bg-[#00ff87]/[0.1]"
					>
						<RotateCcw className="h-3 w-3" strokeWidth={1.75} />
						retry
					</button>
					<button
						type="button"
						onClick={copy}
						className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65 transition-colors duration-200 hover:border-white/30 hover:text-white/95"
					>
						{copied ? <Check className="h-3 w-3" strokeWidth={1.75} /> : <Copy className="h-3 w-3" strokeWidth={1.5} />}
						{copied ? "copied" : "copy details"}
					</button>
					<Link
						href="/patron"
						className="inline-flex h-10 items-center gap-2 rounded-sm border border-white/15 px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65 transition-colors duration-200 hover:border-white/30 hover:text-white/95"
					>
						<ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
						my agents
					</Link>
				</div>
			</SurfaceCard>
		</main>
	);
}
