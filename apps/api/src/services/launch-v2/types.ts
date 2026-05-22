/**
 * Public types for the W42 launch API service.
 *
 * `Tier` is the integer the contract enum maps to (0..3 for 80/90/95/98).
 * The HTTP layer accepts the human-friendly "80"/"90"/"95"/"98" strings and
 * maps them via {@link parseTier}.
 */

export type LaunchTierString = "80" | "90" | "95" | "98";
export type LaunchTierEnum = 0 | 1 | 2 | 3;

export const TIER_STRING_TO_ENUM: Record<LaunchTierString, LaunchTierEnum> = {
	"80": 0,
	"90": 1,
	"95": 2,
	"98": 3,
};

export const TIER_ENUM_TO_STRING: Record<LaunchTierEnum, LaunchTierString> = {
	0: "80",
	1: "90",
	2: "95",
	3: "98",
};

export const TIER_TO_INT: Record<LaunchTierString, 80 | 90 | 95 | 98> = {
	"80": 80,
	"90": 90,
	"95": 95,
	"98": 98,
};

export interface CreateLaunchInput {
	name: string;
	symbol: string;
	metadataURI: string;
	metaCid: string;
	creator: `0x${string}`;
	bundleBot: `0x${string}`;
	commissionReceiver: `0x${string}`;
	platformReceiver: `0x${string}`;
	patron: `0x${string}`;
	agentSafeOwners: `0x${string}`[];
	agentSafeThreshold: number;
	platformBps: number;
	patronBps: number;
	tier: LaunchTierString;
	buyTaxBps: number;
	sellTaxBps: number;
	taxDuration: number;
	antiFarmerDuration: number;
	closeTimestamp: number;
	vanitySalt: `0x${string}`;
	predictedTokenAddress: `0x${string}`;
	noBurn?: boolean;
}

export interface LaunchAddresses {
	token: `0x${string}`;
	vault: `0x${string}`;
	router: `0x${string}`;
	taxSplitter: `0x${string}` | null;
	agentSafe: `0x${string}` | null;
	treasuryReserve: `0x${string}`;
}

export interface CreateLaunchResult extends LaunchAddresses {
	id: string;
	presaleUrl: string;
	txHash: `0x${string}`;
	blockNumber: bigint;
}

export interface VaultOnchainState {
	state: "open" | "closed" | "launched";
	totalDeposited: bigint;
	bonusPool: bigint;
	depositorCount: number;
	closeTimestamp: bigint;
	launchTimestamp: bigint | null;
	presaleTokens: bigint;
}

export interface DepositorPosition {
	address: `0x${string}`;
	deposited: bigint;
	claimed: bigint;
	claimable: bigint;
	totalAllocation: bigint;
	vestingProgress: number; // 0..1
}

export interface PreviewAllocationInput {
	bnbAmount: bigint;
}

export interface PreviewAllocationResult {
	tokens: bigint;
	share: number; // 0..1
	projectedValueBnb: bigint;
}

export const VAULT_STATE_LABELS = ["open", "closed", "launched"] as const;
