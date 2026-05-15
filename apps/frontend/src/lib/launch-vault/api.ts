/**
 * Launch round page API client.
 *
 * - `GET /v2/launches/:id` returns the launch metadata. The W49 page extends
 *   the existing `PublicLaunchResponse` with a few presale-specific fields
 *   (`vaultAddress`, `tier`, `presaleCapWei`, `closeAt`). Backend ships these
 *   when the launch row has them; the page degrades gracefully when missing.
 * - `GET /v2/launches/:id/depositors` returns recent deposit/withdrawal
 *   activity. Backend may not implement it yet, we surface an empty list
 *   and the on-chain event fallback in `use-vault-events` covers the gap.
 */
import { apiFetch, isApiError } from "@/lib/api/_fetcher";

export type LaunchStatus = "draft" | "provisioned" | "queued" | "launching" | "live" | "failed";

export type PublicLaunchExtended = {
	launchId: string;
	agentId: string | null;
	status: LaunchStatus | string;
	creatorAddress: string | null;
	tokenAddress: string | null;
	taxRecipient: string | null;
	firstBuyWei: string;
	launchAuthorizedAt: string | null;
	launchAuthorizedBy: string | null;
	errorMessage: string | null;
	// W49 extensions (optional in response, backend may not populate):
	vaultAddress?: string | null;
	tier?: string | null;
	presaleCapWei?: string | null;
	closeAt?: string | null;
	tokenName?: string | null;
	tokenTicker?: string | null;
	tokenImageUrl?: string | null;
	// Wave H (flap-native) extensions:
	// - `predictedTokenAddress` is the CREATE2-mined `0x…7777` vanity address.
	//   May be null while the backend is still mining the salt.
	// - `metaCid` is the IPFS CID returned by `funcs.flap.sh/api/upload`.
	// - `bundleTipBnb` is the configured priority tip routed to the 48 Club EOA.
	predictedTokenAddress?: string | null;
	metaCid?: string | null;
	bundleTipBnb?: string | null;
};

export type DepositorEvent = {
	kind: "deposit" | "withdraw";
	address: string;
	amountWei: string;
	timestamp: string;
	txHash?: string | null;
};

export type DepositorsResponse = {
	events: DepositorEvent[];
};

export async function fetchPublicLaunch(id: string): Promise<PublicLaunchExtended | null> {
	try {
		return await apiFetch<PublicLaunchExtended>(`/v2/launches/${encodeURIComponent(id)}`);
	} catch (err) {
		if (isApiError(err) && err.status === 404) return null;
		throw err;
	}
}

export async function fetchDepositors(id: string): Promise<DepositorEvent[]> {
	try {
		const res = await apiFetch<DepositorsResponse | DepositorEvent[]>(
			`/v2/launches/${encodeURIComponent(id)}/depositors`,
		);
		if (Array.isArray(res)) return res;
		return res.events ?? [];
	} catch (err) {
		// Endpoint may not exist yet, treat as empty so the on-chain event
		// fallback can take over. Other errors bubble.
		if (isApiError(err) && (err.status === 404 || err.status === 501)) return [];
		throw err;
	}
}
