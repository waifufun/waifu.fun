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

// The waifu-core v2 API wraps every response as `{ ok: true, data: T, requestId }`.
// We must unwrap to expose the raw launch object to the React render layer
// (LaunchPageClient reads `meta.data?.vaultAddress` etc — without unwrap these
// are all undefined and the page renders the BASED/32 BNB/no-data fallback).
// `apiFetch` itself stays envelope-agnostic; unwrapping is per-endpoint to
// match the API surface contract (see launches-list.ts for the same pattern).
type ApiEnvelope<T> = { ok: true; data: T; requestId?: string };

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
	return (
		typeof value === "object" &&
		value !== null &&
		"ok" in value &&
		(value as { ok: unknown }).ok === true &&
		"data" in value
	);
}

export async function fetchPublicLaunch(id: string): Promise<PublicLaunchExtended | null> {
	try {
		const raw = await apiFetch<PublicLaunchExtended | ApiEnvelope<PublicLaunchExtended>>(
			`/v2/launches/${encodeURIComponent(id)}`,
		);
		if (isEnvelope<PublicLaunchExtended>(raw)) return raw.data ?? null;
		// Defensive: pre-envelope responses (older API revisions) come back
		// flat. Return as-is so we don't regress if the wrapper is ever removed.
		return (raw as PublicLaunchExtended) ?? null;
	} catch (err) {
		if (isApiError(err) && err.status === 404) return null;
		throw err;
	}
}

type DepositorsEnvelopePayload = {
	depositors?: DepositorEvent[] | null;
	events?: DepositorEvent[] | null;
};

export async function fetchDepositors(id: string): Promise<DepositorEvent[]> {
	try {
		const raw = await apiFetch<
			DepositorsResponse | DepositorEvent[] | ApiEnvelope<DepositorsEnvelopePayload | DepositorEvent[]>
		>(`/v2/launches/${encodeURIComponent(id)}/depositors`);
		const payload = isEnvelope<DepositorsEnvelopePayload | DepositorEvent[]>(raw) ? raw.data : raw;
		if (Array.isArray(payload)) return payload;
		if (payload && typeof payload === "object") {
			const events = (payload as DepositorsEnvelopePayload).events;
			if (Array.isArray(events)) return events;
			const depositors = (payload as DepositorsEnvelopePayload).depositors;
			if (Array.isArray(depositors)) return depositors;
		}
		return [];
	} catch (err) {
		// Endpoint may not exist yet, treat as empty so the on-chain event
		// fallback can take over. Other errors bubble.
		if (isApiError(err) && (err.status === 404 || err.status === 501)) return [];
		throw err;
	}
}
