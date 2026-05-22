/**
 * Server-safe fetcher for `/v2/agents/:address/burn-rate`.
 *
 * Mirrors `lib/api/agent-burn-rate.ts` but uses raw `fetch` so it works
 * from a server component (the canonical `apiFetch` wrapper depends on
 * a client-side Steward JWT global and per-request cookies).
 *
 * Returns null on any non-200 (e.g. 404 before the endpoint is
 * deployed) or on network failure. Callers must render an honest empty
 * state when null is returned, never invent a number.
 */

export type BurnSnapshot = {
	agentTokenAddress: string;
	generatedAt: number;
	burn24hBnb: number;
	burn24hUsd: number | null;
	burn7dBnb: number;
	burn7dUsd: number | null;
	runwayDays: number | null;
	source: "ankr" | "bscscan" | "rpc-direct" | string;
	byWallet: Array<{ walletId: string; address: string; outflow24hBnb: number; outflow7dBnb: number }>;
};

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

export async function fetchAgentBurnRateSnapshot(address: string): Promise<BurnSnapshot | null> {
	const base = serverApiBase();
	try {
		const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/burn-rate`, {
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as unknown;
		if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
			return (json as { data: BurnSnapshot }).data ?? null;
		}
		return json as BurnSnapshot;
	} catch {
		return null;
	}
}
