/**
 * WaifuDraft — the canonical draft object that backs both native-create
 * and import flows for the waifu-first rewrite.
 *
 * Sections:
 *   entry        – how the draft was initiated (create vs import)
 *   identity     – name / ticker / image / socials
 *   token        – on-chain provenance (native Flap launch OR imported token)
 *   runtime      – agent / cloud runtime config
 *   owner        – wallet ownership & billing info
 *   review       – activation readiness & review state
 */

import type { AddressLike, TChain, TChainId, TURLLike } from "@autofun/types";

// ---------------------------------------------------------------------------
// Enums / Literals
// ---------------------------------------------------------------------------

/** How the draft was initiated */
export type DraftEntryMode = "create" | "import";

/** Provenance describes whether the token is launched natively via Flap or imported */
export type TokenProvenance = "flap" | "imported";

/** Draft lifecycle status */
export type DraftStatus =
	| "draft"
	| "pending_review"
	| "approved"
	| "active"
	| "rejected"
	| "archived";

// ---------------------------------------------------------------------------
// Section: Entry
// ---------------------------------------------------------------------------

export interface DraftEntrySection {
	/** How the user entered the flow */
	mode: DraftEntryMode;
	/** ISO timestamp when the draft was first created */
	createdAt?: string;
	/** Optional referral or campaign tag */
	referral?: string;
}

// ---------------------------------------------------------------------------
// Section: Identity
// ---------------------------------------------------------------------------

export interface DraftIdentitySection {
	name?: string;
	ticker?: string;
	description?: string;
	image?: TURLLike;
	/** Uploaded image key/path (before final URL resolution) */
	imageKey?: string;
	socials?: {
		twitter?: string;
		telegram?: string;
		discord?: string;
		website?: string;
		farcaster?: string;
	};
}

// ---------------------------------------------------------------------------
// Section: Token / Provenance
// ---------------------------------------------------------------------------

/**
 * Flap-native launch configuration.
 * Mirrors the parameters the Flap token factory expects.
 */
export interface FlapLaunchConfig {
	/** Metadata URI uploaded to S3/arweave */
	metadataUri?: string;
	/** Total supply (raw integer, respecting decimals) */
	totalSupply?: number;
	/** Token decimals (usually 9 for Solana) */
	decimals?: number;
	/** Max buy amount during launch window */
	maxBuyAmount?: number;
	/** Delay (seconds) before trading opens after launch */
	delayForTrade?: number;
	/** Bonding curve version to use */
	curveVersion?: number;
	/** Whether to use Token-2022 program */
	isToken2022?: boolean;
}

/**
 * Imported token provenance — first-class branch.
 * Captures on-chain data discovered during import lookup.
 */
export interface ImportedTokenConfig {
	/** The existing contract address on-chain */
	contractAddress: AddressLike;
	chain: TChain;
	chainId: TChainId;
	/** Whether the curve has already completed (bonded) */
	curveCompleted?: boolean;
	/** Pool address if already on a DEX */
	pool?: string;
	/** On-chain metadata URI */
	metadataUri?: string;
	/** Discovered total supply */
	totalSupply?: number;
	/** Discovered decimals */
	decimals?: number;
	/** Whether the token is a Token-2022 */
	isToken2022?: boolean;
	/** Original creator address from chain metadata */
	originalCreator?: AddressLike;
}

export interface DraftTokenSection {
	provenance: TokenProvenance;
	chain?: TChain;
	chainId?: TChainId;

	/** Populated when provenance === "flap" */
	flapConfig?: FlapLaunchConfig;

	/** Populated when provenance === "imported" */
	importedConfig?: ImportedTokenConfig;
}

// ---------------------------------------------------------------------------
// Section: Runtime  (agent / cloud config placeholder)
// ---------------------------------------------------------------------------

export interface DraftRuntimeSection {
	/** Selected agent template or persona key */
	agentTemplate?: string;
	/** Cloud provider (e.g. milady-cloud) */
	cloudProvider?: string;
	/** Arbitrary runtime key-value overrides */
	runtimeOverrides?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Section: Owner / Billing
// ---------------------------------------------------------------------------

export interface DraftOwnerSection {
	/**
	 * Wallet address of the draft creator.
	 * Will become the token creator / owner for claim flow.
	 */
	walletAddress: AddressLike;
	/** Optional display name at creation time */
	displayName?: string;
	/** Billing tier or plan key (future) */
	billingTier?: string;
}

// ---------------------------------------------------------------------------
// Section: Review / Activate
// ---------------------------------------------------------------------------

export interface DraftReviewSection {
	status: DraftStatus;
	/** Human-readable reason when status is "rejected" */
	rejectionReason?: string;
	/** Admin/system reviewer identifier */
	reviewedBy?: string;
	/** ISO timestamp of last review action */
	reviewedAt?: string;
	/** Opaque activation payload produced when status moves to "approved" */
	activationPayload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Canonical Draft Object
// ---------------------------------------------------------------------------

export interface IWaifuDraft {
	/** Mongo _id (string after lean()) */
	_id?: string;

	entry: DraftEntrySection;
	identity: DraftIdentitySection;
	token: DraftTokenSection;
	runtime: DraftRuntimeSection;
	owner: DraftOwnerSection;
	review: DraftReviewSection;

	/** ISO timestamps managed by Mongoose */
	createdAt?: string;
	updatedAt?: string;
}

// ---------------------------------------------------------------------------
// API request / response shapes
// ---------------------------------------------------------------------------

/** POST /drafts — create */
export interface CreateDraftBody {
	entry: DraftEntrySection;
	identity?: Partial<DraftIdentitySection>;
	token: {
		provenance: TokenProvenance;
		chain?: TChain;
		chainId?: TChainId;
		flapConfig?: Partial<FlapLaunchConfig>;
		importedConfig?: Partial<ImportedTokenConfig>;
	};
	runtime?: Partial<DraftRuntimeSection>;
	owner?: {
		displayName?: string;
		billingTier?: string;
	};
}

/** PATCH /drafts/:id — update */
export interface UpdateDraftBody {
	identity?: Partial<DraftIdentitySection>;
	token?: Partial<Omit<DraftTokenSection, "provenance">> & { provenance?: TokenProvenance };
	runtime?: Partial<DraftRuntimeSection>;
	owner?: {
		displayName?: string;
		billingTier?: string;
	};
}

/** POST /drafts/:id/submit — submit for review */
export interface SubmitDraftBody {
	/** Optional notes for the reviewer */
	notes?: string;
}

/** Response envelope */
export interface DraftResponse {
	success: boolean;
	draft?: IWaifuDraft;
	error?: string;
}

/** List response */
export interface DraftListResponse {
	success: boolean;
	drafts: IWaifuDraft[];
	total: number;
	page: number;
	totalPages: number;
}
