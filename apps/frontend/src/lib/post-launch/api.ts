/**
 * Post-launch agent page (W50) API client.
 *
 * `GET /v2/launches/by-token/:tokenAddress` returns the v3 LaunchFactory
 * agent_launches row keyed by the ERC-20 token address. The response
 * shape mirrors the `serializeAgentLaunch()` output in apps/api/src/routes/v2/agent-launches.ts.
 *
 * The page degrades gracefully:
 *   - 404 \u2192 not a v3 launch, render the existing /agent flow.
 *   - any other failure \u2192 also degrade; we don't block the page on this lookup.
 */
import { apiFetch, isApiError } from "@/lib/api/_fetcher";

export type AgentLaunchState = "open" | "closed" | "launched" | "failed";

export interface AgentLaunchTaxSplit {
	platformBps: number;
	patronBps: number;
	agentBps: number;
}

export interface AgentSafeConfig {
	owners: string[];
	threshold: number;
}

export interface AgentLaunchByToken {
	id: string;
	token: string;
	vault: string;
	router: string;
	/** wave M: per-launch TaxSplitter (10/25/65 default split) */
	taxSplitter: string | null;
	/** wave M: per-launch Gnosis Safe controlled by patron */
	agentSafe: string | null;
	/** wave M: numeric tax split bps. null when legacy launch row predates wave M */
	taxSplit: AgentLaunchTaxSplit | null;
	/** wave M: AgentSafe owners + threshold, when configured */
	agentSafeConfig: AgentSafeConfig | null;
	treasuryLp: string | null;
	creator: string;
	tier: number;
	state: AgentLaunchState | string;
	totalDeposited: string;
	bonusPool: string;
	depositorCount: number;
	capacity: string;
	v2BuyBnb: string;
	vestingEnabled: boolean;
	closeTimestamp: number | null;
	launchTimestamp: number | null;
	v2Pair: string | null;
	openMcBnb: string | null;
	metadataUri: string | null;
	metadata: Record<string, unknown>;
	createTxHash: string | null;
	createdAt: string;
	updatedAt: string;
}

export async function fetchLaunchByToken(tokenAddress: string): Promise<AgentLaunchByToken | null> {
	try {
		const res = await apiFetch<{ data?: AgentLaunchByToken } | AgentLaunchByToken>(
			`/v2/launches/by-token/${encodeURIComponent(tokenAddress.toLowerCase())}`,
		);
		// respondOk wraps in `{ data: ... }`; accept either shape so we don't
		// trip if the wrapper changes.
		if (res && typeof res === "object" && "data" in res && res.data) {
			return res.data as AgentLaunchByToken;
		}
		return res as AgentLaunchByToken;
	} catch (err) {
		// 404 = not a v3 launch. Anything else \u2192 also degrade silently; the
		// existing page still renders.
		if (isApiError(err)) return null;
		return null;
	}
}
