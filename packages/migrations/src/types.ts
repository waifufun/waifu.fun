import type { Connection } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import type { AnchorProvider } from "@coral-xyz/anchor";
import type { ProgramContext } from "./programs";
import type { Wallet } from "./utils/customWallet";

import type {
	RaydiumVaultTypes,
	MeteoraVaultTypes,
	CurrentAutofunTypes,
	LegacyAutofunTypes,
} from "@autofun/programs";

export type RpcClient = Connection;

export type MigrationStatus = "active" | "migrating" | "migrated" | "finalized";

export interface MigrationStep {
	name: string;
	description: string;
	execute: (context: MigrationContext) => Promise<any>;
	rollback?: (context: MigrationContext) => Promise<void>;
}

export interface TransactionRecord {
	step: string;
	txId?: string;
	data?: any;
	timestamp: Date;
}

export interface ProtocolState {
	tokenMint: string;
	amount: number;
	migrationName?: string;
	version?: number;
	withdrawnAmounts?: {
		sol: number;
		token: number;
	};
	nftVersion?: "2022" | "legacy";
	primaryTokenAmount?: string;
	primarySolAmount?: string;
	secondaryTokenAmount?: string;
	secondarySolAmount?: string;
	nftAddress?: string;
	nftMint?: string;
	nftMinted?: string[];
	txId?: string;
	transactions?: TransactionRecord[];
	virtualLamportReserves?: number;
	virtualTokenReserves?: number;
	poolAddresses?: {
		id: string;
		lpMint: string;
		vaultA: string;
		vaultB: string;
	};
	poolInfo?: any; // Store the full SDK object as-is
	poolKeys?: any; // Store the full SDK object as-is
	vaultAddress?: string;
	vaultCreatedAt?: Date;
	nftDeposited?: boolean;
	nftDepositedAt?: Date;
	lockLpTxId?: string;
	nftSentToManager?: boolean;
	nftSentToManagerAt?: Date;
	nftSentToManageTxId?: string;
	status?: MigrationStatus;
	poolCreationTxId?: string;
	primaryPositionNftTxId?: string;
	primaryNftMint?: string;
	primaryPositionNftSecret?: string;
	secondaryPositionNftTxId?: string;
	secondaryNftMint?: string;
	secondaryPositionNftSecret?: string;
	poolId?: string;
	primaryPosition?: string;
	secondaryPosition?: string;
	positionNftFinalized?: boolean;
	positionNftFinalizedTxId?: string;
	primaryAmount?: string;
	secondaryAmount?: string;
	primaryAmountSol?: string;
	secondaryAmountSol?: string;
	primaryPositionLocked?: boolean;
	primaryPositionLockedAt?: Date;
	secondaryPositionLocked?: boolean;
	secondaryPositionLockedAt?: Date;
	nftsDeposited?: boolean;
	nftsDepositedAt?: Date;
	migrationFinalized?: boolean;
	migrationFinalizedAt?: Date;
	tokenDecimals?: number;
	primaryNftDepositTxId?: string;
	secondaryNftDepositTxId?: string;
	claimerAddress?: string;
}

export interface MigrationContext {
	rpc: Connection;
	state: ProtocolState;
	wallet?: Wallet;
	provider?: AnchorProvider;
	program?: Program;
	programContext?: ProgramContext;
	raydiumVaultProgram?: Program<RaydiumVaultTypes>;
	meteoraVaultProgram?: Program<MeteoraVaultTypes>;
	autofunProgram?: Program<CurrentAutofunTypes>;
	autofunLegacyProgram?: Program<LegacyAutofunTypes>;
}

export interface MigrationOptions {
	name: string;
	version?: number;
}

export interface MigrationResult {
	success: boolean;
	error?: Error;
}

export interface ProtocolMigration {
	id: string;
	name: string;
	version: number;
	status: "active" | "migrating" | "migrated" | "finalized" | "failed";
	currentStep: number;
	lastSuccessfulStep?: number;
	protocolState: ProtocolState;
	startedAt: Date;
	createdAt: Date;
	updatedAt: Date;
	error?: string;
	completedAt?: Date;
}

export interface MigrationState {
	migrationName: string;
	version: number;
	currentStep: number;
	status: MigrationStatus;
	startedAt: Date;
	completedAt?: Date;
	error?: string;
	lastSuccessfulStep?: number;
	protocolState?: Record<string, any>;
}

export interface MigrationProgress {
	totalSteps: number;
	completedSteps: number;
	currentStep: number;
	status: MigrationStatus;
	error?: string;
	protocolState?: Record<string, any>;
}
