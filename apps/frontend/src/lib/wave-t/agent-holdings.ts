/**
 * Server-safe fetcher for `/v2/agents/:address/holdings`.
 *
 * Returns a normalized NAV snapshot when the endpoint is live, and `null`
 * when the endpoint is not yet deployed (404) or any other failure. The
 * caller is expected to render an honest empty / fall back to a partial
 * source when the result is null - never to invent data.
 *
 * The /holdings endpoint ships in PR #712 (NAV aggregator). Until it is
 * merged + deployed in prod, every call returns null and the consumer
 * falls back to its previous best-effort source (AgentSafe BNB balance,
 * or the legacy multi-chain burner stub).
 *
 * Why this lives in `lib/wave-t/` instead of `lib/api/`: the canonical
 * `apiFetch` wrapper reads a Steward JWT from a module global that is
 * only set client-side, and uses cookies via `credentials: include`.
 * The agent page is server-rendered for static export, so it cannot use
 * `apiFetch`. This file mirrors the wire format but uses raw `fetch`
 * with revalidation, like the other server-side wave-t fetchers in this
 * directory.
 */

export type AgentHoldingsHolding = {
	walletId: string;
	walletAddress: string;
	walletLabel: string;
	walletRole: "agent-safe" | "agent-hot" | "patron" | "venue-bridge" | string;
	chain: string;
	asset: string;
	contract: string | null;
	balance: number;
	priceUsd: number | null;
	valueUsd: number | null;
	priced: boolean;
	kind?: "spot" | "perp" | "lp" | string;
};

export type AgentHoldingsSnapshot = {
	agentTokenAddress: string;
	generatedAt: number;
	navUsd: number;
	unpriced: { count: number; assets: string[] };
	byChain: Record<string, number>;
	byWallet: Record<string, number>;
	byRole: Record<string, number>;
	holdings: AgentHoldingsHolding[];
	stale: { source: string; reason: string }[];
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

/**
 * Fetch the aggregated holdings snapshot for an agent.
 *
 * Returns null on any non-200, including the 404 we serve today before
 * #712 lands in prod. Network failures degrade to null so the agent
 * page never throws.
 */
export async function fetchAgentHoldingsSnapshot(address: string): Promise<AgentHoldingsSnapshot | null> {
	const base = serverApiBase();
	try {
		const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/holdings`, {
			next: { revalidate: 30 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as unknown;
		if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
			return (json as { data: AgentHoldingsSnapshot }).data ?? null;
		}
		return json as AgentHoldingsSnapshot;
	} catch {
		return null;
	}
}
