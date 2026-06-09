/**
 * ERC-8004 identity fetcher.
 *
 * Reads `GET /v2/agents/:address/identity` from the waifu.fun API.
 * Returns `null` on 404 / network errors / shape mismatch so the UI
 * can render absence cleanly (no badge, no panel).
 *
 * Until Track 1A ships the real endpoint, the fetcher falls back to a
 * Sol-specific mock when the address matches the architect address.
 * The mock is gated behind `NEXT_PUBLIC_ERC8004_MOCK_SOL` (defaults
 * on in non-production, off in production) so we never accidentally
 * ship fake identity data.
 */

import { ARCHITECT_AGENT_ADDRESS } from "@/lib/wave-t/architect-agent";

import type { Erc8004IdentityRecord, Erc8004RegistrationFile } from "./types";

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

function mockEnabled(): boolean {
	const explicit = process.env.NEXT_PUBLIC_ERC8004_MOCK_SOL?.toLowerCase();
	if (explicit === "false" || explicit === "0") return false;
	if (explicit === "true" || explicit === "1") return true;
	return process.env.NODE_ENV !== "production";
}

/**
 * Type guard. Validates the shape of `Erc8004IdentityRecord` so we
 * never let a malformed backend payload through.
 */
export function isErc8004IdentityRecord(value: unknown): value is Erc8004IdentityRecord {
	if (!value || typeof value !== "object") return false;
	const r = value as Record<string, unknown>;
	return (
		r.standard === "erc-8004" &&
		typeof r.chain === "string" &&
		typeof r.chainId === "number" &&
		typeof r.registryAddress === "string" &&
		typeof r.tokenId === "string" &&
		typeof r.agentURI === "string" &&
		(r.metadataHttpsUrl === null || typeof r.metadataHttpsUrl === "string") &&
		(r.metadataIpfsUri === null || typeof r.metadataIpfsUri === "string") &&
		typeof r.ownerWalletAddress === "string" &&
		typeof r.txHash === "string" &&
		(r.blockNumber === null || typeof r.blockNumber === "string") &&
		typeof r.registeredAt === "string" &&
		(r.firstWaifuAgent === undefined || typeof r.firstWaifuAgent === "boolean")
	);
}

/**
 * Sol's mock identity. Lines up with the production-target shape but
 * uses placeholder tokenId / tx until Track 1A ships real mainnet
 * registration. NOT exported — only the fetcher should access this.
 */
function solMockIdentity(): Erc8004IdentityRecord {
	return {
		standard: "erc-8004",
		chain: "bsc",
		chainId: 56,
		// Registry address from BNBAgent integration brief, section 3a.
		registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
		tokenId: "1",
		agentURI: "ipfs://bafybeigdyrztjsol8004mocksolmocksolmocksolmocksolmockq",
		metadataHttpsUrl: "https://api.waifu.fun/v2/agents/sol/erc8004.json",
		metadataIpfsUri: "ipfs://bafybeigdyrztjsol8004mocksolmocksolmocksolmocksolmockq",
		ownerWalletAddress: "0xCF3104986C4ef45326A918A9F7F80DE57953Fc21",
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
		blockNumber: null,
		registeredAt: "2026-05-24T06:00:00.000Z",
		firstWaifuAgent: true,
	};
}

export async function fetchAgentIdentity(address: string): Promise<Erc8004IdentityRecord | null> {
	const base = serverApiBase();
	try {
		const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/identity`, {
			next: { revalidate: 300 },
		});
		if (res.status === 404) {
			return mockFallback(address);
		}
		if (!res.ok) {
			return mockFallback(address);
		}
		const json = (await res.json()) as unknown;
		const data = json && typeof json === "object" && "data" in json ? (json as { data?: unknown }).data : json;
		return isErc8004IdentityRecord(data) ? data : mockFallback(address);
	} catch {
		return mockFallback(address);
	}
}

function mockFallback(address: string): Erc8004IdentityRecord | null {
	if (!mockEnabled()) return null;
	if (address.toLowerCase() === ARCHITECT_AGENT_ADDRESS.toLowerCase()) {
		return solMockIdentity();
	}
	return null;
}

/**
 * Fetch the registration file pointed to by an agentURI. Used by the
 * "view raw JSON" button in the provenance panel. Returns null on
 * any failure (CORS, 404, malformed JSON).
 */
export async function fetchRegistrationFile(record: Erc8004IdentityRecord): Promise<Erc8004RegistrationFile | null> {
	// Prefer the HTTPS mirror for browser fetches (IPFS gateways are
	// flaky and add CORS friction). Fall back to the IPFS URI through
	// a public gateway if the HTTPS mirror is missing.
	const url = record.metadataHttpsUrl ?? ipfsToGateway(record.metadataIpfsUri ?? record.agentURI);
	if (!url) return null;
	try {
		const res = await fetch(url, { cache: "no-store" });
		if (!res.ok) return null;
		const json = (await res.json()) as unknown;
		if (!json || typeof json !== "object") return null;
		return json as Erc8004RegistrationFile;
	} catch {
		return null;
	}
}

/** Convert an `ipfs://<cid>[/path]` URI to a public HTTPS gateway URL. */
export function ipfsToGateway(uri: string | null): string | null {
	if (!uri) return null;
	if (uri.startsWith("https://") || uri.startsWith("http://")) return uri;
	if (!uri.startsWith("ipfs://")) return null;
	const path = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
	return `https://ipfs.io/ipfs/${path}`;
}

/**
 * Map a chainId to the chain slug 8004scan.io uses in its agent path.
 *
 * Verified against the live explorer (2026-06-02): the canonical agent
 * profile path is `/agents/<chain>/<tokenId>` (plural "agents", chain
 * NAME not chainId). `/agent/<chainId>/...` 404s. We derive the slug
 * from `chainId` and fall back to the record's `chain` label when the
 * id is unknown, so a future chain still produces a best-effort link.
 */
export function scanChainSlug(record: Erc8004IdentityRecord): string {
	switch (record.chainId) {
		case 56:
			return "bsc";
		case 97:
			return "bsc-testnet";
		case 1:
			return "ethereum";
		case 8453:
			return "base";
		default:
			return record.chain;
	}
}

/**
 * Build the 8004scan.io agent profile URL for a given identity.
 *
 * Canonical format (verified live 2026-06-02):
 *   https://8004scan.io/agents/<chain>/<tokenId>
 */
export function build8004ScanUrl(record: Erc8004IdentityRecord): string {
	return `https://8004scan.io/agents/${scanChainSlug(record)}/${encodeURIComponent(record.tokenId)}`;
}

/** Build the BSCscan tx URL for the registration mint. */
export function buildScanTxUrl(record: Erc8004IdentityRecord): string {
	const host = record.chainId === 56 ? "bscscan.com" : record.chainId === 97 ? "testnet.bscscan.com" : "etherscan.io";
	return `https://${host}/tx/${record.txHash}`;
}

/** Build the scan URL for the owner wallet. */
export function buildScanAddressUrl(record: Erc8004IdentityRecord, address: string): string {
	const host = record.chainId === 56 ? "bscscan.com" : record.chainId === 97 ? "testnet.bscscan.com" : "etherscan.io";
	return `https://${host}/address/${address}`;
}
