/**
 * Client-side live-refresh hooks for the agent page.
 *
 * The agent page is a static export (Cloudflare Pages, `output: "export"`).
 * Every server fetch in `app/agent/[address]/page.tsx` happens once at
 * `next build` and the resulting HTML embeds frozen values. Without
 * these hooks, the price stays at the build-time snapshot forever and
 * the chart literally stops mid-day.
 *
 * Pattern: SSG snapshot seeds the initial state, then a `useEffect`
 * polls the live API endpoint at a sensible cadence. The component
 * always has data to paint on first render (no spinner, no layout
 * shift) and the values walk forward as the agent operates.
 *
 * Polling cadences mirror the upstream cache windows:
 *   - candles:        30s   (geckoterminal cache ~60s)
 *   - holdings:       30s
 *   - token metrics:  30s   (dexscreener)
 *   - twitter stats:  300s  (API cache 600s)
 *   - tweets:         300s
 *   - own trades:     15s   (most volatile, on-chain delta)
 *   - generic:        used by activity feed merger
 *
 * Every hook is defensive: a failed poll never wipes out the previous
 * good value, fetches are guarded against unmounted-component setState,
 * and the abort signal is wired into `fetch` so a long-running request
 * can be cancelled by a fast unmount.
 */

"use client";

import { useEffect, useState } from "react";

import type { AgentTrade } from "@/components/agent-home/types";
import { type AgentHoldingsSnapshot, fetchAgentHoldingsSnapshot } from "@/lib/wave-t/agent-holdings";
import { type TwitterStats, fetchAgentTwitterStats } from "@/lib/wave-t/agent-twitter";
import { type HoldingsSnapshot, holdingsSnapshotFromApi } from "@/lib/wave-t/holdings";
import { type TokenMetrics, fetchTokenMetrics } from "@/lib/wave-t/token";
import { type Tweet, fetchTweetsForAgent } from "@/lib/wave-t/voice";

/** Cancellable, mount-guarded polling primitive. */
function usePoller(tick: (signal: AbortSignal) => Promise<void>, intervalMs: number, deps: unknown[]) {
	// `tick` and `intervalMs` intentionally not listed: the deps array is
	// computed by the caller and is authoritative for when polling should
	// restart. Including the function identity would force a restart on
	// every render.
	// biome-ignore lint/correctness/useExhaustiveDependencies: caller supplies authoritative deps
	useEffect(() => {
		let cancelled = false;
		const controller = new AbortController();
		const run = async () => {
			if (cancelled) return;
			try {
				await tick(controller.signal);
			} catch {
				// swallow; never wipe state on a transient failure
			}
		};
		// First tick immediately after hydration so we replace SSG values fast.
		run();
		const id = window.setInterval(run, intervalMs);
		return () => {
			cancelled = true;
			controller.abort();
			window.clearInterval(id);
		};
	}, deps);
}

// ── candles ────────────────────────────────────────────────────
//
// The price chart manages its own per-range polling internally
// (see `price-chart.tsx`). No hook needed here because each
// timeframe has its own cadence and cache.

// ── token metrics ──────────────────────────────────────────────

export function useLiveTokenMetrics(contract: string, initial: TokenMetrics, intervalMs = 10_000): TokenMetrics {
	const [metrics, setMetrics] = useState<TokenMetrics>(initial);
	usePoller(
		async () => {
			if (!contract) return;
			const next = await fetchTokenMetrics(contract);
			if (next.priceUsd > 0 || next.marketCap > 0) setMetrics(next);
		},
		intervalMs,
		[contract],
	);
	return metrics;
}

// ── holdings (aggregated NAV) ──────────────────────────────────

export type LiveHoldings = {
	snapshot: HoldingsSnapshot;
	/** Whether the live poll got a real aggregated snapshot back. */
	hasAggregated: boolean;
};

export function useLiveHoldings(
	address: string,
	initialSnapshot: HoldingsSnapshot,
	initialHasAggregated: boolean,
	intervalMs = 10_000,
): LiveHoldings {
	const [state, setState] = useState<LiveHoldings>({
		snapshot: initialSnapshot,
		hasAggregated: initialHasAggregated,
	});
	usePoller(
		async () => {
			const raw: AgentHoldingsSnapshot | null = await fetchAgentHoldingsSnapshot(address);
			if (!raw) return;
			setState({ snapshot: holdingsSnapshotFromApi(raw), hasAggregated: true });
		},
		intervalMs,
		[address],
	);
	return state;
}

// ── twitter stats ──────────────────────────────────────────────

export function useLiveTwitterStats(
	address: string,
	initial: TwitterStats | null,
	intervalMs = 300_000,
): TwitterStats | null {
	const [stats, setStats] = useState<TwitterStats | null>(initial);
	usePoller(
		async () => {
			const next = await fetchAgentTwitterStats(address);
			if (next) setStats(next);
		},
		intervalMs,
		[address],
	);
	return stats;
}

// ── tweets ─────────────────────────────────────────────────────

export function useLiveTweets(address: string, initial: Tweet[], intervalMs = 300_000): Tweet[] {
	const [tweets, setTweets] = useState<Tweet[]>(initial);
	usePoller(
		async () => {
			const result = await fetchTweetsForAgent(address, 5);
			if (result.tweets.length > 0) setTweets(result.tweets);
		},
		intervalMs,
		[address],
	);
	return tweets;
}

// ── own trades ─────────────────────────────────────────────────

/**
 * Fetch the agent's own trade history on a client-side timer. Used by
 * the activity feed so trades reflect on-chain activity within ~15s
 * even though the page itself is static-exported.
 */
export function useLiveAgentTrades(address: string, initial: AgentTrade[], intervalMs = 15_000): AgentTrade[] {
	const [trades, setTrades] = useState<AgentTrade[]>(initial);
	usePoller(
		async () => {
			const base = clientApiBase();
			const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/activity-trades`, {
				cache: "no-store",
			});
			if (!res.ok) return;
			const data = (await res.json()) as unknown;
			if (!Array.isArray(data)) return;
			const next: AgentTrade[] = data
				.slice(0, 20)
				.map((raw) => mapTrade(raw as Record<string, unknown>))
				.filter((t): t is AgentTrade => t !== null);
			if (next.length > 0) setTrades(next);
		},
		intervalMs,
		[address],
	);
	return trades;
}

function clientApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	return "https://api.waifu.fun";
}

function mapTrade(raw: Record<string, unknown>): AgentTrade | null {
	const txId = typeof raw.txHash === "string" ? raw.txHash : typeof raw.txId === "string" ? raw.txId : "";
	if (!txId) return null;
	const sideRaw = raw.side ?? raw.type;
	const type: "buy" | "sell" = sideRaw === "sell" ? "sell" : "buy";
	const ts =
		typeof raw.blockTimestamp === "string"
			? Date.parse(raw.blockTimestamp)
			: typeof raw.timestamp === "number"
				? raw.timestamp
				: Date.now();
	const amount = pickAmount(raw, type);
	const trade: AgentTrade = {
		txId,
		type,
		address: typeof raw.trader === "string" ? raw.trader : typeof raw.address === "string" ? raw.address : "",
		amount,
		timestamp: Number.isFinite(ts) ? ts : Date.now(),
	};
	if (typeof raw.tokenAddress === "string") trade.tokenAddress = raw.tokenAddress;
	if (typeof raw.tokenSymbol === "string") trade.tokenSymbol = raw.tokenSymbol;
	if (typeof raw.traderRole === "string" && (raw.traderRole === "agent-safe" || raw.traderRole === "agent-hot")) {
		trade.traderRole = raw.traderRole;
	}
	if (typeof raw.usdValue === "number") trade.usdValue = raw.usdValue;
	return trade;
}

function pickAmount(raw: Record<string, unknown>, type: "buy" | "sell"): string | number {
	const candidate =
		type === "sell" ? (raw.amountIn ?? raw.fromAmount ?? raw.amount) : (raw.amountOut ?? raw.toAmount ?? raw.amount);
	if (typeof candidate === "string" || typeof candidate === "number") return candidate;
	return 0;
}
