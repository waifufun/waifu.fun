/**
 * ERC-8004 identity types as surfaced by waifu.fun.
 *
 * Mirrors the response shape promised by the (forthcoming) backend
 * route `GET /v2/agents/:address/identity`, defined in
 * `BNBAGENT-INTEGRATION-RESEARCH-2026-05-24.md` section 3a (Track 1A).
 *
 * The on-chain record is intentionally small: NFT ownership + URI live
 * on the registry contract, everything richer lives in the registration
 * file at the URI (HTTPS + IPFS mirrored).
 *
 * Honesty notes:
 *   - `tokenId` is a string because BSC tokenIds can exceed JS safe int
 *     range (`numeric(78,0)` in postgres). Treat it as opaque text.
 *   - `chainId` is numeric. `chain` is a friendly label ("bsc").
 *   - `registeredAt` is ISO-8601. The frontend formats it locally.
 *   - When the agent has no on-chain identity, the API returns 404 and
 *     the fetcher returns `null`. The UI MUST render nothing in that
 *     case (no "not verified" copy, no empty panel).
 */

export type Erc8004ChainName = "bsc" | "bsc-testnet" | "ethereum" | "base";

export interface Erc8004IdentityRecord {
	/** Standard label, currently always "erc-8004". */
	standard: "erc-8004";
	/** Human-readable chain label, e.g. "bsc". */
	chain: Erc8004ChainName;
	/** Numeric chain id (56 for BSC mainnet). */
	chainId: number;
	/** Identity registry contract address (checksummed). */
	registryAddress: string;
	/** ERC-721 tokenId, as a decimal string. */
	tokenId: string;
	/** Resolved agent URI on-chain. Prefer ipfs:// when both present. */
	agentURI: string;
	/** HTTPS mirror of the registration file (waifu.fun hosted). */
	metadataHttpsUrl: string | null;
	/** IPFS CID URI for the registration file (`ipfs://<cid>`). */
	metadataIpfsUri: string | null;
	/** Wallet that owns the identity NFT (Steward wallet for waifu agents). */
	ownerWalletAddress: string;
	/** Transaction hash of the registration mint. */
	txHash: string;
	/** Block number of the mint, as a decimal string. */
	blockNumber: string | null;
	/** ISO-8601 timestamp of the registration. */
	registeredAt: string;
	/** Subjective ordering hint: lowest waifu tokenId is "first". */
	firstWaifuAgent?: boolean;
}

/**
 * Shape of the registration file at `agentURI`, per ERC-8004.
 * Used only by the "view raw JSON" modal in the provenance panel.
 */
export interface Erc8004RegistrationFile {
	type: string;
	name: string;
	description: string;
	image?: string;
	services?: Array<{
		name: string;
		endpoint: string;
		version?: string;
	}>;
	active?: boolean;
	registrations?: Array<{
		agentId: number | string;
		agentRegistry: string;
	}>;
	supportedTrust?: string[];
	[key: string]: unknown;
}
