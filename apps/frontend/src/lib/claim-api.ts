/**
 * Claim-flow API helpers.
 *
 * All requests use `credentials: "include"` so the patron session cookie
 * (set by /auth/twitter/callback) travels with the fetch.
 */

export type ClaimStatus = "needs-x" | "needs-fund" | "launched" | "expired";

export interface ClaimAgent {
	agentId: string;
	name: string;
	bio: string | null;
	imageUrl: string | null;
	ticker: string | null;
	walletAddress: string | null;
	webUrl?: string | null;
	twitterUrl?: string | null;
	telegramUrl?: string | null;
}

export interface ClaimInfo {
	agent: ClaimAgent;
	claimStatus: ClaimStatus;
	claimedByXHandle: string | null;
	expiresAt: string | null;
	tax: { feeRate: number; recipientAddress: string | null } | null;
	// When the backend's LAUNCH_BROADCAST_ENABLED flag is false, this
	// comes back as `false` and the UI should render a "launches paused"
	// state instead of the fund/skip buttons. Falls back to `true` on
	// older API versions so we don't accidentally gate the UI.
	launchEnabled?: boolean;
}

// Same-origin path for credentialed XHR — see src/lib/same-origin-api.ts.
import { SAME_ORIGIN_API } from "@/lib/same-origin-api";
const API = SAME_ORIGIN_API;

/** Fetch claim metadata by raw token. Returns null if 404 or 410 (expired). */
export async function fetchClaimInfo(token: string): Promise<{ info: ClaimInfo | null; expired: boolean }> {
	try {
		const res = await fetch(`${API}/v2/agents/claim/${encodeURIComponent(token)}`, {
			cache: "no-store",
		});
		if (res.status === 410) return { info: null, expired: true };
		if (!res.ok) return { info: null, expired: false };
		const json = await res.json();
		return { info: (json?.data ?? null) as ClaimInfo | null, expired: false };
	} catch {
		return { info: null, expired: false };
	}
}

/** Mark the claim as attributed to the currently-authenticated patron. */
export async function claimAgent(token: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await fetch(`${API}/v2/agents/claim/${encodeURIComponent(token)}`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		if (!res.ok) {
			const json = await res.json().catch(() => null);
			return { ok: false, error: json?.error || `HTTP ${res.status}` };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
	}
}

export interface EditClaimInput {
	name?: string;
	symbol?: string;
	description?: string;
	imageUrl?: string;
	webUrl?: string;
	twitterUrl?: string;
	telegramUrl?: string;
	tax?: {
		feeRate?: 1 | 3 | 5 | 10;
		recipient?: "agent" | "patron" | "custom";
		recipientAddress?: string;
	};
}

/** Edit a claimed (but not yet launched) agent's name/ticker/bio/image. */
export async function editClaim(token: string, input: EditClaimInput): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await fetch(`${API}/v2/agents/claim/${encodeURIComponent(token)}`, {
			method: "PATCH",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!res.ok) {
			const json = await res.json().catch(() => null);
			return { ok: false, error: json?.detail || json?.error || `HTTP ${res.status}` };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
	}
}

/** Broadcast the cached launch tx. Returns the live token address on success. */
export async function launchClaimed(
	token: string,
	args: { fundAmountBnb?: string; fundTxHash?: string } = {},
): Promise<{ ok: boolean; tokenAddress?: string; txHash?: string; error?: string }> {
	try {
		const res = await fetch(`${API}/v2/agents/claim/${encodeURIComponent(token)}/launch`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(args),
		});
		const json = await res.json().catch(() => null);
		if (!res.ok) {
			return { ok: false, error: json?.error || json?.detail || `HTTP ${res.status}` };
		}
		return {
			ok: true,
			tokenAddress: json?.data?.tokenAddress,
			txHash: json?.data?.txHash,
		};
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
	}
}
