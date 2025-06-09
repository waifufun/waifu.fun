import type { MigrationStep, MigrationContext } from "../types";
import { commonSendNftStep, commonCollectFeesStep } from "../steps/common";
import { withdrawLiquidity } from "../utils/protocol-utils";
import {
	createPool,
	initRaydiumSdkAndFetchPoolInfo,
	lockLP,
	finalizeLockLP,
	depositNftToRaydiumVault,
} from "./raydium/calls";
import BN from "bn.js";
import DB from "@autofun/database";
import { PublicKey } from "@solana/web3.js";

export type RaydiumMigrationContext = MigrationContext;

export const raydiumMigrationSteps: MigrationStep[] = [
	{
		name: "withdraw",
		description: "Withdraw liquidity from Raydium pool",
		execute: async (context: RaydiumMigrationContext) => {
			const { state } = context;
			await withdrawLiquidity(context, state.tokenMint);
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "createPool",
		description: "Create a new Raydium pool",
		execute: async (context: RaydiumMigrationContext) => {
			const { state } = context;

			if (!state.withdrawnAmounts) {
				throw new Error("No withdrawn amounts found. Withdrawal must be completed first.");
			}

			const { txId, poolAddresses, extraData } = await createPool(context, {
				tokenMint: state.tokenMint,
				amountToken: state.withdrawnAmounts.token,
				amountSol: state.withdrawnAmounts.sol,
				deadline: Math.floor(Date.now() / 1000) + 120,
			});

			// Update state with transaction ID
			state.txId = txId;
			state.primaryTokenAmount = extraData.primaryAmount;
			state.primarySolAmount = extraData.primaryAmountSol;
			state.secondaryTokenAmount = extraData.secondaryAmount;
			state.secondarySolAmount = extraData.secondaryAmountSol;
			state.poolId = poolAddresses.id;
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "initLockLP",
		description: "Initialize LP token lock",
		execute: async (context: RaydiumMigrationContext) => {
			const { state } = context;

			if (!state.txId) {
				throw new Error("No pool creation transaction found. Pool must be created first.");
			}

			const lastTx = state.transactions?.find((tx) => tx.step === "createPool");
			if (!lastTx?.data?.poolAddresses?.id) {
				throw new Error("Pool ID not found in transaction data");
			}

			// Initialize SDK and fetch pool info
			const { raydium, poolInfo } = await initRaydiumSdkAndFetchPoolInfo(context, lastTx.data.poolAddresses.id);

			// Store pool info in state for later use
			state.poolInfo = poolInfo;

			// Record the initialization
			if (!state.transactions) {
				state.transactions = [];
			}

			// Update database with pool info and withdrawn amounts
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						poolInfo: JSON.stringify(poolInfo),
						withdrawnAmounts: JSON.stringify(state.withdrawnAmounts),
						migratedAt: new Date(),
					},
				},
			);

			console.log("LP token lock initialized for pool:", state?.poolAddresses?.id);
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "lockPrimaryLP",
		description: "Lock primary LP tokens",
		execute: async (context: RaydiumMigrationContext) => {
			await lockPrimaryLP(context);
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "lockSecondaryLP",
		description: "Lock secondary LP tokens",
		execute: async (context: RaydiumMigrationContext) => {
			await lockSecondaryLP(context);
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "finalizeLockLP",
		description: "Finalize LP token lock",
		execute: async (context: RaydiumMigrationContext) => {
			await finalizeLockLP(context);
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	commonSendNftStep,
	{
		name: "depositNft",
		description: "Deposit NFT to Raydium vault",
		execute: async (context: RaydiumMigrationContext) => {
			const { state } = context;
			const { nftMint } = state;
			if (!nftMint) {
				throw new Error("NFT mint not found in state");
			}

			// Use the manager multisig address as the claimer
			const token = await DB.Token.findOne({
				contractAddress: state.tokenMint,
			});
			if (!token?.creator) {
				throw new Error("No creator address found in token database");
			}

			const claimerAddress = new PublicKey(token.creator);
			const { txId } = await depositNftToRaydiumVault(context, nftMint, claimerAddress);
			state.nftDeposited = true;
			state.nftDepositedAt = new Date();
			state.txId = txId;
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},

	commonCollectFeesStep,
	{
		name: "finalize",
		description: "Finalize migration",
		execute: async (context: RaydiumMigrationContext) => {
			const { state } = context;

			// Update state to mark migration as finalized
			state.migrationFinalized = true;
			state.migrationFinalizedAt = new Date();

			// Update token status to finalized
			state.status = "finalized";

			// Update migration status in database
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						status: "finalized",
						finalizedAt: new Date(),
						updatedAt: new Date(),
					},
				},
			);

			// Update token status in database
			await DB.Token.findOneAndUpdate(
				{ mint: state.tokenMint },
				{
					$set: {
						status: "finalized",
						updatedAt: new Date(),
					},
				},
			);

			console.log("Migration and token finalized for:", state.tokenMint);
		},
		rollback: async (context: RaydiumMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
];

export async function lockPrimaryLP(context: MigrationContext): Promise<string> {
	const { state } = context;
	if (!state.poolInfo) {
		throw new Error("Pool info not found in state");
	}

	// Get the primary lock amount from state transactions
	const initLockTx = state.transactions?.find((tx) => tx.step === "initLockLP");
	if (!initLockTx?.data?.primaryAmount) {
		throw new Error("Primary lock amount not found in state");
	}

	const primaryAmount = new BN(initLockTx.data.primaryAmount);

	return lockLP({
		context,
		poolId: state.poolInfo.id.toString(),
		amount: primaryAmount,
		isPrimary: true,
	});
}

export async function lockSecondaryLP(context: MigrationContext): Promise<string> {
	const { state } = context;
	if (!state.poolInfo) {
		throw new Error("Pool info not found in state");
	}

	// Get the secondary lock amount from state transactions
	const initLockTx = state.transactions?.find((tx) => tx.step === "initLockLP");
	if (!initLockTx?.data?.secondaryAmount) {
		throw new Error("Secondary lock amount not found in state");
	}

	const secondaryAmount = new BN(initLockTx.data.secondaryAmount);

	return lockLP({
		context,
		poolId: state.poolInfo.id.toString(),
		amount: secondaryAmount,
		isPrimary: false,
	});
}
