/**
 * EIP-8004 agent identity NFT registration.
 *
 * CONVERGENCE: this mirrors @stwd/erc8004 IdentityRegistryClient; swap to
 * the shared package once it is published (tracked: waifu issue / Steward PR #91).
 *
 * Every waifu.fun agent should register an EIP-8004 identity NFT BEFORE
 * creating its token on Four.Meme, so the `creator → NFT → AgentIdentifier`
 * chain resolves and Four.Meme's UI tags the token with the (AI) badge.
 *
 * This is a port of the canonical reference script shipped by the Four.Meme
 * team in their `four-meme-ai` npm package
 * (`skills/four-meme-integration/scripts/8004-register.ts`) into a reusable
 * function that cooperates with Steward-managed wallets.
 *
 * The EIP-8004 identity NFT contract exposes:
 *   function register(string agentURI) returns (uint256 agentId)
 *   event    Registered(uint256 indexed agentId, string agentURI, address indexed owner)
 *
 * `agentURI` is a self-describing data URI of the form
 *   data:application/json;base64,<payload>
 * where payload is:
 *   {
 *     "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
 *     "name": "<agent display name>",
 *     "description": "<free text>",
 *     "image": "<https image URL, optional>",
 *     "active": true,
 *     "supportedTrust": [""]
 *   }
 *
 * The orchestrator wires this between Steward wallet provisioning and
 * Four.Meme SIWE login. It is intentionally tolerant of failure — if the
 * identity registration reverts, we log a warning and continue (the token
 * launch still succeeds, just without the (AI) badge).
 */

import {
	type Address,
	type Hex,
	type PublicClient,
	decodeEventLog,
	encodeFunctionData,
	getAddress,
	parseAbi,
} from "viem";

/** BSC mainnet EIP-8004 identity NFT (Four.Meme deployment). */
export const DEFAULT_EIP8004_NFT_ADDRESS: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

/** `type` field on the registration payload — pinned to EIP-8004 v1. */
export const EIP8004_REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

export const EIP8004_ABI = parseAbi([
	"function register(string agentURI) returns (uint256 agentId)",
	"function ownerOf(uint256 tokenId) view returns (address)",
	"function tokenURI(uint256 tokenId) view returns (string)",
	"function balanceOf(address owner) view returns (uint256)",
	"function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
	"event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export const IDENTITY_REGISTRY_ABI = EIP8004_ABI;

export interface AgentCard {
	name: string;
	description?: string;
	walletAddress?: string;
	apiUrl?: string;
	capabilities?: string[];
	services?: string[];
	image?: string;
	imageUrl?: string;
	active?: boolean;
	supportedTrust?: string[];
	agentURI?: string;
	tokenId?: string;
}

export interface Eip8004RegistrationPayload {
	type: string;
	name: string;
	description: string;
	image: string;
	active: boolean;
	supportedTrust: string[];
}

/**
 * Build the `agentURI` data URI the contract expects.
 *
 * Mirrors the reference script's behaviour exactly — including the
 * `supportedTrust: [""]` placeholder and the default description.
 */
export function buildAgentURI(opts: AgentCard): {
	agentURI: string;
	payload: Eip8004RegistrationPayload;
} {
	const payload: Eip8004RegistrationPayload = {
		type: EIP8004_REGISTRATION_TYPE,
		name: opts.name ?? "",
		description:
			opts.description && opts.description.trim().length > 0 ? opts.description : "I'm four.meme trading agent",
		image: opts.image ?? opts.imageUrl ?? "",
		active: opts.active ?? true,
		supportedTrust: opts.supportedTrust ?? [""],
	};
	const json = JSON.stringify(payload);
	const base64 = Buffer.from(json, "utf8").toString("base64");
	return {
		agentURI: `data:application/json;base64,${base64}`,
		payload,
	};
}

/**
 * Minimal "send tx" surface the registration needs. We accept either:
 *   - a viem WalletClient (for local private-key flows / tests), or
 *   - a `{ sendTransaction }` adapter (for Steward-managed wallets)
 *
 * Keeping this narrow lets the orchestrator pass whichever signer it has
 * provisioned without forcing a viem-only path.
 */
export interface Eip8004Signer {
	/**
	 * Send a transaction (to the EIP-8004 contract) and return the tx hash.
	 * Implementations MUST broadcast and return the on-chain hash — otherwise
	 * `registerAgentIdentity` cannot wait for the receipt.
	 */
	sendTransaction(args: {
		to: Address;
		data: Hex;
		value?: bigint;
	}): Promise<Hex>;
}

export interface RegisterAgentIdentityOpts {
	/** Signer adapter (Steward or raw wallet). */
	signer: Eip8004Signer;
	/** Public client for waiting on the receipt + decoding logs. */
	publicClient: PublicClient;
	/** Human-readable agent name written into agentURI. */
	name: string;
	/** Optional agent avatar / banner URL. */
	imageUrl?: string;
	/** Optional free-text description; defaults to the Four.Meme boilerplate. */
	description?: string;
	/** Override contract — defaults to BSC mainnet deployment. */
	contractAddress?: Address;
	/** Receipt wait timeout in ms. Default 180_000. */
	receiptTimeoutMs?: number;
	/** Optional chain id included in the shared-client-compatible result. */
	chainId?: number;
}

export interface RegisterAgentIdentityResult {
	/** The NFT token id / agent id returned by the `Registered` event. */
	agentId: bigint;
	/** Transaction hash of the `register(...)` call. */
	txHash: Hex;
	/** Full agentURI as submitted to the contract. */
	agentURI: string;
	/** Decoded JSON payload we base64-wrapped into agentURI. */
	payload: Eip8004RegistrationPayload;
	/** Contract address we registered against. */
	contractAddress: Address;
	/** @stwd/erc8004-compatible token id string. */
	tokenId: string;
	/** @stwd/erc8004-compatible registry address. */
	registryAddress: Address;
	/** @stwd/erc8004-compatible submitted URI alias. */
	agentCardUri: string;
	/** Chain id when supplied by the caller. */
	chainId?: number;
}

/**
 * Encode `register(string)` calldata. Kept as a named export so tests can
 * assert the calldata without invoking a full signer.
 */
export function encodeRegisterCalldata(agentURI: string): Hex {
	return encodeFunctionData({
		abi: EIP8004_ABI,
		functionName: "register",
		args: [agentURI],
	});
}

/**
 * Register an EIP-8004 agent identity NFT.
 *
 * Flow:
 *   1. Build `agentURI` (data URI JSON).
 *   2. Encode `register(agentURI)` calldata.
 *   3. Ask the signer to broadcast the tx (value = 0).
 *   4. Wait for the receipt, decode the `Registered(uint256, string, address)`
 *      event, return the `agentId`.
 *
 * Reverts propagate. The orchestrator is responsible for swallowing them if
 * it wants the flow to continue without the (AI) badge.
 */
export async function registerAgentIdentity(opts: RegisterAgentIdentityOpts): Promise<RegisterAgentIdentityResult> {
	const contractAddress = getAddress(opts.contractAddress ?? DEFAULT_EIP8004_NFT_ADDRESS);

	const { agentURI, payload } = buildAgentURI({
		name: opts.name,
		...(opts.imageUrl !== undefined ? { imageUrl: opts.imageUrl } : {}),
		...(opts.description !== undefined ? { description: opts.description } : {}),
	});

	const data = encodeRegisterCalldata(agentURI);

	const txHash = await opts.signer.sendTransaction({
		to: contractAddress,
		data,
		value: 0n,
	});

	const receipt = await opts.publicClient.waitForTransactionReceipt({
		hash: txHash,
		timeout: opts.receiptTimeoutMs ?? 180_000,
	});

	if (receipt.status !== "success") {
		throw new Error(`EIP-8004 register reverted (status=${receipt.status}, tx=${txHash})`);
	}

	const lcContract = contractAddress.toLowerCase();
	let agentId: bigint | null = null;
	for (const log of receipt.logs) {
		if (log.address.toLowerCase() !== lcContract) continue;
		try {
			const decoded = decodeEventLog({
				abi: EIP8004_ABI,
				data: log.data,
				topics: log.topics,
			});
			if (decoded.eventName === "Registered") {
				const args = decoded.args as unknown as { agentId?: bigint };
				if (typeof args.agentId === "bigint") {
					agentId = args.agentId;
					break;
				}
			}
		} catch {
			// non-Registered log — skip
		}
	}

	if (agentId === null) {
		throw new Error(`EIP-8004 register: Registered event not found in receipt (tx=${txHash})`);
	}

	return {
		agentId,
		txHash,
		agentURI,
		payload,
		contractAddress,
		tokenId: agentId.toString(),
		registryAddress: contractAddress,
		agentCardUri: agentURI,
		...(opts.chainId !== undefined ? { chainId: opts.chainId } : {}),
	};
}
