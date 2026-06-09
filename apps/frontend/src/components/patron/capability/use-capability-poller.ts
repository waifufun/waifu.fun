/**
 * Live poller for capability data-provider endpoints.
 *
 * The Patron page is a static export (`output: "export"`, Cloudflare Pages):
 * any fetch at build time freezes into the HTML. Capability data views
 * (positions / pnl / income) MUST therefore poll client-side. This mirrors the
 * Wave T `usePoller` discipline: mount-guarded, abortable, tab-hidden aware,
 * and a failed poll NEVER wipes the last good value.
 *
 * It's generic over the descriptor's `endpoint` string so the panel can render
 * ANY capability's data without per-venue code.
 */

"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/_fetcher";

export interface CapabilityPollState<T> {
	data: T | null;
	/** True until the first successful (or failed) tick resolves. */
	loading: boolean;
	/** True once at least one poll has come back, regardless of payload. */
	loaded: boolean;
	/** Last error, if the most recent tick failed and we have no prior data. */
	error: Error | null;
}

/**
 * Poll a relative API `endpoint` on an interval.
 *
 * @param endpoint  relative path (e.g. `/v2/agents/:id/hyperliquid/positions`).
 *                  When null, polling is disabled (planned capabilities).
 * @param intervalMs cadence; defaults to 30s to match the HL live cadence.
 */
export function useCapabilityPoll<T = unknown>(endpoint: string | null, intervalMs = 30_000): CapabilityPollState<T> {
	const [state, setState] = useState<CapabilityPollState<T>>({
		data: null,
		loading: Boolean(endpoint),
		loaded: false,
		error: null,
	});
	// Keep the latest good value across renders so a transient failure can be
	// distinguished from a genuine empty state.
	const lastGood = useRef<T | null>(null);

	useEffect(() => {
		if (!endpoint) {
			setState({ data: null, loading: false, loaded: true, error: null });
			return;
		}
		let cancelled = false;
		const controller = new AbortController();

		const run = async () => {
			if (cancelled) return;
			if (typeof document !== "undefined" && document.hidden) return;
			try {
				const next = await apiFetch<T>(endpoint, { signal: controller.signal });
				if (cancelled) return;
				lastGood.current = next;
				setState({ data: next, loading: false, loaded: true, error: null });
			} catch (err) {
				if (cancelled) return;
				// Keep the last good value; only surface an error if we never had one.
				setState((prev) => ({
					data: lastGood.current,
					loading: false,
					loaded: true,
					error: lastGood.current ? null : (err as Error),
				}));
			}
		};

		run();
		const id = window.setInterval(run, intervalMs);
		const onVisible = () => {
			if (!document.hidden) run();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			cancelled = true;
			controller.abort();
			window.clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [endpoint, intervalMs]);

	return state;
}
