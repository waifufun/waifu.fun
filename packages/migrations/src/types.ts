import type { Connection } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { AnchorProvider } from '@coral-xyz/anchor';
import { EVMRpcProvider, SolanaRpcProvider } from '@autofun/rpc';
import DB from '@autofun/database';
import { ProgramContext } from './programs';
import type { RaydiumVault } from './vaults/programs/types/raydium_vault';
import type { MeteoraVault } from './vaults/programs/types/meteora_vault';
import type { Autofun } from './vaults/programs/types/autofun';

export type RpcClient = Connection;

export type MigrationStatus = 'active' | 'migrating' | 'migrated' | 'finalized';

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
  vaultAddress?: string;
  vaultCreatedAt?: Date;
  nftDeposited?: boolean;
  nftDepositedAt?: Date;
  lockLpTxId?: string;
  nftSentToManager?: boolean;
  nftSentToManagerAt?: Date;
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
  wallet?: any;
  provider?: any;
  program?: Program;
  programContext?: ProgramContext;
  raydiumVaultProgram?: Program<RaydiumVault>;
  meteoraVaultProgram?: Program<MeteoraVault>;
  autofunProgram?: Program<Autofun>;
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
  status: 'active' | 'migrating' | 'migrated' | 'finalized';
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