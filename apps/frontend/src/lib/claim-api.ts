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
}

export interface ClaimInfo {
	agent: ClaimAgent;
	claimStatus: ClaimStatus;
	claimedByXHandle: string | null;
	expiresAt: string | null;
	tax: { feeRate: number; recipientAddress: string | null } | null;
}

const API = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun").replace(/\/$/, "");

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
