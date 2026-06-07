"use client";

/**
 * Client-side prelaunch resolver for `/agent/[address]`.
 *
 * The agent page's server component (`page.tsx`) only knows two sources of
 * truth for an "agent": `GET /v2/agents/:address` (graduated agents) and the
 * legacy `GET /tokens/:address` fallback. A freshly-launched v3 token that
 * has NOT graduated yet has no row in either, so the page used to call
 * `notFound()` and the address 404'd until graduation.
 *
 * Those pre-graduation tokens DO have a row at
 * `GET /v2/launches/by-token/:token` (state = open | closed | failed). The
 * canonical UX for that lifecycle phase is the `/launch/[id]` surface, which
 * already renders the full presale/bonding experience (hero, deposit/refund/
 * claim widgets, tier ladder, depositor feed, curve progress). `AgentHomeV2`
 * already links the other direction via `LiveLaunchBanner`, confirming the
 * intended split: presale lives at `/launch/[id]`, the graduated agent home
 * lives at `/agent/[address]`.
 *
 * We resolve this on the client (not via `next/navigation`'s `redirect()`)
 * because the app builds with `output: "export"`: the agent page is static,
 * server-side redirects don't run for arbitrary runtime addresses, and a
 * fresh launch is never pre-rendered. This mirrors the three-layer redirect
 * shim used by `/agent/sol`.
 *
 * Behaviour:
 *   - launch row exists (any non-graduated state) → replace() to /launch/[id]
 *   - no launch row (true 404) → render the calm not-found state
 *   - while resolving → render a quiet shimmer so we never flash 404
 */
import { useEffect, useState } from "react";

import { fetchLaunchByToken } from "@/lib/post-launch/api";

import NotFound from "./not-found";

type Phase = "resolving" | "not-found";

export function PrelaunchResolver({ address }: { address: string }) {
	const [phase, setPhase] = useState<Phase>("resolving");

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const launch = await fetchLaunchByToken(address);
			if (cancelled) return;

			// A launch row with an id means this token is mid-lifecycle
			// (presale/bonding/refund). Send it to the canonical launch page.
			// `launched` should normally resolve to a graduated agent row, but
			// if the agent row isn't live yet the launch page still renders a
			// sensible "claim available" surface, so we forward it too.
			if (launch?.id) {
				const target = `/launch/${encodeURIComponent(launch.id)}`;
				if (typeof window !== "undefined" && window.location.pathname !== target) {
					window.location.replace(target);
					return;
				}
			}

			setPhase("not-found");
		})();

		return () => {
			cancelled = true;
		};
	}, [address]);

	if (phase === "not-found") {
		return <NotFound />;
	}

	return <ResolvingState />;
}

/**
 * Quiet shimmer shown while we look up the launch row. Matches the agent
 * page's loading rhythm so the redirect feels like a continuation, not a
 * separate screen.
 */
function ResolvingState() {
	return (
		<main className="flex min-h-[100dvh] items-center justify-center px-6 text-white">
			<div className="w-full max-w-md text-center">
				<div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/40">agent / resolving</div>
				<div className="relative mx-auto mt-5 h-12 w-full max-w-xs overflow-hidden rounded-sm border border-white/10 bg-[#08080a]">
					<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
				</div>
				<p className="mx-auto mt-4 max-w-[40ch] text-sm leading-relaxed text-white/45">
					checking launch status for this address.
				</p>
			</div>
		</main>
	);
}

export default PrelaunchResolver;
