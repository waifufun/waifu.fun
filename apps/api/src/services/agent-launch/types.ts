/**
 * Types for the agent-launch flow.
 *
 * The orchestrator takes a persona-ish input, provisions a Steward agent wallet,
 * walks Four.Meme's SIWE + upload + create-token API, and then calls
 * `TokenManager2.createToken(createArg, signature)` from the agent wallet via
 * Steward. Each step's result is captured so the flow is idempotent-ish and
 * inspectable from the caller.
 */

import type { Address, Hex } from "viem";

import type {
	BagsFeeConfig,
	BankrFeeConfig,
	FlapFeeConfig,
	FourMemeRegularFeeConfig,
	FourMemeTaxFeeConfig,
} from "@waifufun/launchpad";

export type FourMemeLabel =
	| "Meme"
	| "AI"
	| "Defi"
	| "Games"
	| "Infra"
	| "De-Sci"
	| "Social"
	| "Depin"
	| "Charity"
	| "Others";

export interface FourMemeTaxConfig {
	/** Must be one of 1, 3, 5, or 10 per Four.Meme API rules. */
	feeRate: 1 | 3 | 5 | 10;
	burnRate: number;
	divideRate: number;
	liquidityRate: number;
	recipientRate: number;
	/** Treasury address that receives `recipientRate` of fees. */
	recipientAddress: Address;
	/** Minimum hold amount (ether units). Must be `d * 10^n`, n>=5, 1<=d<=9. */
	minSharing: number;
}

export interface AgentPersonaConfig {
	/** Freeform persona JSON stored alongside the token. Not sent on-chain. */
	[key: string]: unknown;
}

export interface TaxSplitRoutingConfig {
	agentBps: number;
	patronBps: number;
	/** Optional platform wallet that receives a platform side of the split. */
	platformAddress?: Address;
	/** Platform share of the recipient stream. Agent and patron fill the remainder. */
	platformBps?: number;
	/** Patron wallet that receives the patron side of the split. */
	patronAddress?: Address;
	/** Existing immutable splitter to reuse when re-preparing an edited claim. */
	splitterAddress?: Address;
}

export type ProvisionLaunchpadInput =
	| { id: "four-meme-regular"; feeConfig: FourMemeRegularFeeConfig }
	| { id: "four-meme-tax"; feeConfig: FourMemeTaxFeeConfig }
	| {
			id: "flap";
			feeConfig: FlapFeeConfig;
			platformWalletAddress?: Address;
			flapVaultPortalAddress?: Address;
			flapSplitVaultFactoryAddress?: Address;
	  }
	| { id: "bankr"; feeConfig: BankrFeeConfig }
	| { id: "bags"; feeConfig: BagsFeeConfig };

export interface AgentLaunchInput {
	/** Internal agent id. Stable slug — generated if not supplied. */
	agentId?: string;
	/** Internal tenant id for Steward provisioning. Default "waifu". */
	tenantId?: string;

	// --- Token metadata ---
	name: string;
	symbol: string;
	description: string;

	/**
	 * Image: either `imageUrl` (http/https, we fetch it) or `imageBase64`
	 * (data URI or raw base64). Exactly one must be supplied.
	 */
	imageUrl?: string;
	imageBase64?: string;
	imageMimeType?: string;
	imageFilename?: string;

	// --- Four.Meme launch params ---
	label?: FourMemeLabel;
	webUrl?: string;
	twitterUrl?: string;
	telegramUrl?: string;
	/** Creator auto-buy at launch, BNB string (e.g. "0.1"). */
	preSale?: string;
	/** AntiSniperFeeMode dynamic fee decay. */
	feePlan?: boolean;
	/** X Mode (MPC-only) — keep false for agent tokens. */
	onlyMPC?: boolean;
	/** Launch time in ms. Default Date.now(). */
	launchTime?: number;

	/**
	 * If present, launches as a TaxToken (creatorType=5). The recipientAddress
	 * should be the agent treasury — the orchestrator will default it to the
	 * agent wallet unless an override is supplied.
	 */
	tax?: Omit<FourMemeTaxConfig, "recipientAddress"> & {
		/** Override treasury. Defaults to agent wallet address. */
		recipientAddress?: Address;
	};
	/** Optional immutable TaxSplitter routing metadata for multi-recipient tax. */
	taxSplit?: TaxSplitRoutingConfig;
	/** Wizard launchpad payload translated for adapter-aware callers. */
	launchpad?: ProvisionLaunchpadInput;

	// --- Persona / bookkeeping ---
	persona?: AgentPersonaConfig;

	/**
	 * If you already have an agent wallet (skip Steward provisioning). Mostly
	 * for tests. Caller is responsible for ensuring the address matches an
	 * existing Steward-managed agent.
	 */
	existingAgent?: {
		agentId: string;
		walletAddress: Address;
	};

	/**
	 * If true, skip EIP-8004 agent identity NFT registration. Useful for tests
	 * and for retrying token creation when the identity NFT is already minted.
	 * Default false — production launches should always register so the token
	 * gets the Four.Meme (AI) creator badge.
	 */
	skipIdentityRegistration?: boolean;

	/**
	 * Override EIP-8004 identity NFT contract address. Defaults to the BSC
	 * mainnet deployment (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432).
	 */
	identityContractAddress?: Address;

	/**
	 * If true, any EIP-8004 identity registration failure aborts the launch
	 * (default: false — failures are logged and the flow continues without the
	 * (AI) badge). Overrides the orchestrator-level `continueOnIdentityFailure`
	 * default when set.
	 */
	strictIdentityRegistration?: boolean;
}

export interface StewardAgentWallet {
	agentId: string;
	walletAddress: Address;
	tenantId: string;
}

export interface FourMemeLoginResult {
	accessToken: string;
	nonce: string;
}

export interface FourMemeImageUploadResult {
	imageUrl: string;
}

export interface FourMemeCreateResult {
	createArg: Hex;
	signature: Hex;
	/** Raw response for debugging. */
	raw: unknown;
}

export interface AgentLaunchResult {
	agentId: string;
	walletAddress: Address;
	treasuryAddress: Address;
	tokenAddress: Address;
	txHash: Hex;
	fourMeme: {
		nonce: string;
		imageUrl: string;
		createArgHash: string;
		requestId?: string;
	};
	/**
	 * EIP-8004 identity NFT registration result. Present when identity
	 * registration was attempted and succeeded. Omitted when
	 * `skipIdentityRegistration` was true or the step failed non-fatally.
	 *
	 * `agentId` is the NFT token id returned by the `Registered` event,
	 * stringified so the struct serializes cleanly to JSON.
	 */
	agentIdentity?: {
		/** NFT token id (from `Registered` event), stringified. */
		agentId: string;
		/** Transaction hash of the `register(...)` call. */
		txHash: Hex;
		/** The `agentURI` (data URI JSON) we registered. */
		agentURI: string;
		/** Contract address we registered against (informational). */
		contractAddress: Address;
	};
}

/**
 * Raised-token defaults — Four.Meme expects this block verbatim for BNB-quoted
 * launches. Sourced from API-CreateToken.md. The API also accepts this being
 * omitted; we include it explicitly so our output matches the docs 1-to-1.
 */
export const FOURMEME_BNB_RAISED_TOKEN = Object.freeze({
	symbol: "BNB",
	nativeSymbol: "BNB",
	symbolAddress: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
	deployCost: "0",
	buyFee: "0.01",
	sellFee: "0.01",
	minTradeFee: "0",
	b0Amount: "8",
	totalBAmount: "24",
	// four.meme requires this explicitly on create; fixed at 24 BNB per
	// their bonding curve contract (see FOURMEME_LANDSCAPE notes).
	raisedAmount: "24",
	totalAmount: "1000000000",
	logoUrl: "https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png",
	tradeLevel: ["0.1", "0.5", "1"],
	status: "PUBLISH",
	buyTokenLink: "https://pancakeswap.finance/swap",
	reservedNumber: 10,
	saleRate: "0.8",
	networkCode: "BSC",
	platform: "MEME",
});
