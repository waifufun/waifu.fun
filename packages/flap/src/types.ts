import type { Address, Hex } from "viem";

export const FLAP_TOKEN_STATUSES = {
	INVALID: 0,
	TRADABLE: 1,
	IN_DUEL: 2,
	KILLED: 3,
	DEX: 4,
	STAGED: 5,
} as const;

export type FlapTokenStatus = (typeof FLAP_TOKEN_STATUSES)[keyof typeof FLAP_TOKEN_STATUSES];

export const FLAP_TOKEN_VERSIONS = {
	TOKEN_LEGACY_MINT_NO_PERMIT: 0,
	TOKEN_LEGACY_MINT_NO_PERMIT_DUPLICATE: 1,
	TOKEN_V2_PERMIT: 2,
	TOKEN_GOPLUS: 3,
	TOKEN_TAXED: 4,
	TOKEN_TAXED_V2: 5,
	TOKEN_TAXED_V3: 6,
} as const;

export type FlapTokenVersion = (typeof FLAP_TOKEN_VERSIONS)[keyof typeof FLAP_TOKEN_VERSIONS];

export const FLAP_V3_LP_FEE_PROFILES = {
	STANDARD: 0,
	LOW: 1,
	HIGH: 2,
} as const;

export type FlapV3LpFeeProfile = (typeof FLAP_V3_LP_FEE_PROFILES)[keyof typeof FLAP_V3_LP_FEE_PROFILES];

export const FLAP_DEX_IDS = {
	DEX0: 0,
	DEX1: 1,
	DEX2: 2,
} as const;

export type FlapDexId = (typeof FLAP_DEX_IDS)[keyof typeof FLAP_DEX_IDS];

export const FLAP_MIGRATOR_TYPES = {
	V3_MIGRATOR: 0,
	V2_MIGRATOR: 1,
} as const;

export type FlapMigratorType = (typeof FLAP_MIGRATOR_TYPES)[keyof typeof FLAP_MIGRATOR_TYPES];

/**
 * Flap docs currently document behavior/defaults for the first enum item, but
 * do not publish a full human-readable DexThreshType enum table for BSC.
 */
export type FlapDexThreshType = number;

export interface FlapNewTokenV5Params {
	name: string;
	symbol: string;
	meta: string;
	dexThresh: FlapDexThreshType;
	salt: Hex;
	taxRate: number;
	migratorType: FlapMigratorType;
	quoteToken: Address;
	quoteAmt: bigint;
	beneficiary: Address;
	permitData: Hex;
	extensionID: Hex;
	extensionData: Hex;
	dexId: FlapDexId;
	lpFeeProfile: FlapV3LpFeeProfile;
	taxDuration: bigint;
	antiFarmerDuration: bigint;
	mktBps: number;
	deflationBps: number;
	dividendBps: number;
	lpBps: number;
	minimumShareBalance: bigint;
}

export interface BuildFlapNewTokenV5ParamsInput {
	name: string;
	symbol: string;
	meta: string;
	salt: Hex;
	beneficiary: Address;
	dexThresh?: FlapDexThreshType;
	taxRate?: number;
	migratorType?: FlapMigratorType;
	quoteToken?: Address;
	quoteAmt?: bigint;
	permitData?: Hex;
	extensionID?: Hex;
	extensionData?: Hex;
	dexId?: FlapDexId;
	lpFeeProfile?: FlapV3LpFeeProfile;
	taxDuration?: bigint;
	antiFarmerDuration?: bigint;
	mktBps?: number;
	deflationBps?: number;
	dividendBps?: number;
	lpBps?: number;
	minimumShareBalance?: bigint;
}

export interface SplitVaultRecipient {
	recipient: Address;
	bps: number;
}

export interface FlapNewTokenV6WithVaultParams {
	name: string;
	symbol: string;
	meta: string;
	dexThresh: FlapDexThreshType;
	salt: Hex;
	migratorType: FlapMigratorType;
	quoteToken: Address;
	quoteAmt: bigint;
	permitData: Hex;
	extensionID: Hex;
	extensionData: Hex;
	dexId: FlapDexId;
	lpFeeProfile: FlapV3LpFeeProfile;
	buyTaxRate: number;
	sellTaxRate: number;
	taxDuration: bigint;
	antiFarmerDuration: bigint;
	mktBps: number;
	deflationBps: number;
	dividendBps: number;
	lpBps: number;
	minimumShareBalance: bigint;
	dividendToken: Address;
	commissionReceiver: Address;
	tokenVersion: FlapTokenVersion;
	vaultFactory: Address;
	vaultData: Hex;
}

export interface BuildFlapNewTokenV6WithVaultParamsInput {
	name: string;
	symbol: string;
	meta: string;
	salt: Hex;
	vaultFactory: Address;
	vaultData: Hex;
	dexThresh?: FlapDexThreshType;
	buyTaxRate?: number;
	sellTaxRate?: number;
	migratorType?: FlapMigratorType;
	quoteToken?: Address;
	quoteAmt?: bigint;
	permitData?: Hex;
	extensionID?: Hex;
	extensionData?: Hex;
	dexId?: FlapDexId;
	lpFeeProfile?: FlapV3LpFeeProfile;
	taxDuration?: bigint;
	antiFarmerDuration?: bigint;
	mktBps?: number;
	deflationBps?: number;
	dividendBps?: number;
	lpBps?: number;
	minimumShareBalance?: bigint;
	dividendToken?: Address;
	commissionReceiver?: Address;
	tokenVersion?: FlapTokenVersion;
}

export interface FlapQuoteExactInputParams {
	inputToken: Address;
	outputToken: Address;
	inputAmount: bigint;
}

export interface FlapSwapExactInputParams extends FlapQuoteExactInputParams {
	minOutputAmount: bigint;
	permitData: Hex;
}

export interface FlapTokenStateV7Raw {
	status: FlapTokenStatus;
	reserve: bigint;
	circulatingSupply: bigint;
	price: bigint;
	tokenVersion: FlapTokenVersion;
	r: bigint;
	h: bigint;
	k: bigint;
	dexSupplyThresh: bigint;
	quoteTokenAddress: Address;
	nativeToQuoteSwapEnabled: boolean;
	extensionID: Hex;
	taxRate: bigint;
	pool: Address;
	progress: bigint;
	lpFeeProfile: FlapV3LpFeeProfile;
	dexId: FlapDexId;
}

export interface FlapTokenStateV7 extends FlapTokenStateV7Raw {
	statusLabel: string;
	tokenVersionLabel: string;
	lpFeeProfileLabel: string;
	dexIdLabel: string;
}

export interface FlapMetadataRecord {
	buy: string | null;
	creator: Address;
	description: string;
	sell: string | null;
	telegram: string | null;
	twitter: string | null;
	website: string | null;
}

export interface FlapMetadataUploadImageInput {
	path?: string;
	bytes?: Uint8Array | ArrayBuffer;
	filename?: string;
	contentType?: string;
}

export interface UploadFlapMetadataInput {
	metadata: FlapMetadataRecord;
	image: FlapMetadataUploadImageInput | Blob;
	uploadUrl?: string;
	apiKey?: string;
	signal?: AbortSignal;
}

export interface UploadFlapMetadataResult {
	cid: string;
	uploadUrl: string;
}

export interface FindFlapVanitySaltInput {
	taxRate: number;
	mktBps?: number;
	tokenVersion?: FlapTokenVersion;
	salt?: Hex;
	seed?: Hex;
	suffix?: string;
	portalAddress?: Address;
	tokenImplementation?: Address;
	chainId?: number;
	network?: string;
	yieldEvery?: number;
	onProgress?: (iterations: number, currentSalt: Hex) => void;
}

export interface FindFlapVanitySaltResult {
	salt: Hex;
	address: Address;
	suffix: string;
	iterations: number;
	tokenImplementation: Address;
	portalAddress: Address;
}
