"use client";

/**
 * <AppCreditsHeader />
 *
 * The hard requirement: signed-in users must see their eliza cloud
 * app-credit balance prominently before they consume the service.
 *
 * design contract spec: ~/.moltbot/projects/waifu/TRACK-C-MINIAPP-DESIGN-2026-05-25.md §7
 *
 * SCAFFOLD ONLY. real impl should:
 *   - pull the user's privy token from steward auth context
 *   - use swr (or react-query) for caching + revalidation
 *   - poll every 30s only when the tab is visible
 *   - refetch with ?fresh=true after runs and after top-up returns
 */

import { useCallback, useEffect, useRef, useState } from "react";

type BalanceResponse = {
	success?: boolean;
	balance: number;
	totalPurchased?: number;
	totalSpent?: number;
	isLow?: boolean;
};

type Props = {
	elizaCloudAppId: string;
	perCallUsdEstimate: number;
	/** bump this to force a refetch (e.g. after a successful run) */
	refreshNonce?: number;
};

const ELIZA_CLOUD_BASE = process.env.NEXT_PUBLIC_ELIZA_CLOUD_URL ?? "https://eliza.steward.fi";
const POLL_MS = 30_000;

async function fetchBalance(
	elizaCloudAppId: string,
	privyToken: string | null,
	fresh: boolean,
): Promise<BalanceResponse | null> {
	if (!privyToken) return null;
	const url = new URL(`${ELIZA_CLOUD_BASE}/api/v1/app-credits/balance`);
	url.searchParams.set("app_id", elizaCloudAppId);
	if (fresh) url.searchParams.set("fresh", "true");
	const res = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${privyToken}` },
		cache: "no-store",
	});
	if (!res.ok) return null;
	return (await res.json()) as BalanceResponse;
}

// TODO: replace with real privy hook from steward auth provider
function usePrivyToken(): string | null {
	// e.g. const { getAccessToken } = usePrivy();
	return null;
}

export function AppCreditsHeader({ elizaCloudAppId, perCallUsdEstimate, refreshNonce = 0 }: Props) {
	const privyToken = usePrivyToken();
	const [balance, setBalance] = useState<BalanceResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const mountedRef = useRef(true);

	const refetch = useCallback(
		async (fresh: boolean) => {
			const next = await fetchBalance(elizaCloudAppId, privyToken, fresh);
			if (mountedRef.current) {
				setBalance(next);
				setLoading(false);
			}
		},
		[elizaCloudAppId, privyToken],
	);

	useEffect(() => {
		mountedRef.current = true;
		void refetch(false);
		return () => {
			mountedRef.current = false;
		};
	}, [refetch]);

	// poll every 30s, but only when tab visible
	useEffect(() => {
		let intervalId: ReturnType<typeof setInterval> | null = null;
		const tick = () => {
			if (document.visibilityState === "visible") void refetch(false);
		};
		const start = () => {
			if (!intervalId) intervalId = setInterval(tick, POLL_MS);
		};
		const stop = () => {
			if (intervalId) {
				clearInterval(intervalId);
				intervalId = null;
			}
		};
		const onVis = () => (document.visibilityState === "visible" ? start() : stop());
		const onFocus = () => void refetch(false);

		start();
		document.addEventListener("visibilitychange", onVis);
		window.addEventListener("focus", onFocus);
		return () => {
			stop();
			document.removeEventListener("visibilitychange", onVis);
			window.removeEventListener("focus", onFocus);
		};
	}, [refetch]);

	// refetch fresh when caller signals a consumption happened
	useEffect(() => {
		if (refreshNonce > 0) void refetch(true);
	}, [refreshNonce, refetch]);

	if (!privyToken) {
		return (
			<div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-400">
				sign in to see your credits and use this app
			</div>
		);
	}

	if (loading) {
		return (
			<div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-500">
				loading credits…
			</div>
		);
	}

	if (!balance) {
		return (
			<div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
				could not load credit balance. refresh to try again.
			</div>
		);
	}

	const remaining = Math.floor(balance.balance / perCallUsdEstimate);
	const isLow = balance.balance < perCallUsdEstimate * 5;
	const isEmpty = balance.balance < perCallUsdEstimate;

	return (
		<div
			className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
				isEmpty
					? "border-red-900/50 bg-red-950/30"
					: isLow
						? "border-amber-700/50 bg-amber-950/20"
						: "border-zinc-800 bg-zinc-950/50"
			}`}
		>
			<div>
				<p className="text-xs uppercase tracking-wide text-zinc-500">your credits</p>
				<p className="text-xl font-semibold text-zinc-100">${balance.balance.toFixed(2)}</p>
				<p className="text-xs text-zinc-500">~{remaining} image{remaining === 1 ? "" : "s"} remaining</p>
			</div>
			<button
				type="button"
				onClick={() => {
					// TODO: open top-up modal — see design doc §7.4
					// stub: redirect to a placeholder route
					window.location.href = `/agent/billing/top-up?app_id=${elizaCloudAppId}`;
				}}
				className="rounded border border-amber-400/50 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10"
			>
				top up
			</button>
		</div>
	);
}
