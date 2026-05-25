"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/_fetcher";

export type HyperliquidPosition = {
	coin: string;
	side: "long" | "short";
	size: number;
	entryPrice: number | null;
	currentPrice: number | null;
	leverage: number | null;
	notionalUsd: number;
	marginUsd: number;
	liquidationPrice: number | null;
	unrealizedPnlUsd: number;
	unrealizedPnlPct: number | null;
	roe: number | null;
};

export type HyperliquidPositionsSnapshot = {
	wallet: string | null;
	accountValueUsd: number;
	withdrawableUsd: number;
	positions: HyperliquidPosition[];
	ts: number;
};

const EMPTY: HyperliquidPositionsSnapshot = {
	wallet: null,
	accountValueUsd: 0,
	withdrawableUsd: 0,
	positions: [],
	ts: 0,
};

/**
 * Poll the live Hyperliquid positions endpoint for a given agent.
 * Default cadence: every 5s; honours `document.hidden` to pause when
 * the tab is backgrounded. Errors are surfaced but do not nuke the
 * last good snapshot (we'd rather show a stale row than a blank
 * panel).
 */
export function useHyperliquidPositions(
	agentId: string | null,
	options: { pollMs?: number } = {},
): { snapshot: HyperliquidPositionsSnapshot; isLoading: boolean; error: Error | null } {
	const { pollMs = 5_000 } = options;
	const [snapshot, setSnapshot] = useState<HyperliquidPositionsSnapshot>(EMPTY);
	const [isLoading, setIsLoading] = useState(Boolean(agentId));
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!agentId) {
			setSnapshot(EMPTY);
			setIsLoading(false);
			return;
		}
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let inFlight = false;
		const path = `/v2/agents/${encodeURIComponent(agentId)}/hyperliquid/positions`;

		const schedule = () => {
			if (cancelled || pollMs <= 0) return;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => void load(), pollMs);
		};
		const load = async () => {
			if (cancelled || inFlight) return;
			if (typeof document !== "undefined" && document.hidden) {
				schedule();
				return;
			}
			inFlight = true;
			try {
				const data = await apiFetch<HyperliquidPositionsSnapshot>(path);
				if (!cancelled) {
					setSnapshot({
						wallet: data.wallet ?? null,
						accountValueUsd: Number(data.accountValueUsd) || 0,
						withdrawableUsd: Number(data.withdrawableUsd) || 0,
						positions: Array.isArray(data.positions) ? data.positions : [],
						ts: data.ts ?? Date.now(),
					});
					setError(null);
				}
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
			} finally {
				inFlight = false;
				if (!cancelled) setIsLoading(false);
				schedule();
			}
		};
		setIsLoading(true);
		void load();
		const onVis = () => {
			if (typeof document !== "undefined" && !document.hidden) void load();
		};
		if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
		};
	}, [agentId, pollMs]);

	return { snapshot, isLoading, error };
}
