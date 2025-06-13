import { PublicKey } from "@solana/web3.js";
import type { MigrationStep, MigrationContext } from "../types";
import { commonSendNftStep, commonCollectFeesStep } from "../steps/common";
import { withdrawLiquidity } from "../utils/protocol-utils";
import BN from "bn.js";
import {
	createPositionNft,
	finalizePositionNft,
	createPool,
	createPosition,
	addLiquidity,
	depositNftToMeteora,
} from "./meteora/calls";
import DB from "@autofun/database";
import { recordTransaction } from "../utils/protocol-utils";

export type MeteoraMigrationContext = MigrationContext;

export const meteoraMigrationSteps: MigrationStep[] = [
	{
		name: "withdraw",
		description: "Withdraw liquidity from Meteora pool",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;

			await withdrawLiquidity(context, state.tokenMint);
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "createPrimaryPositionNft",
		description: "Create primary position NFT",
		execute: async (context: MigrationContext) => {
			const { state } = context;
			const withdrawTx = state.transactions?.find((tx) => tx.step === "withdrawLiquidity");
			if (!withdrawTx?.txId) {
				throw new Error("Withdraw transaction not found in state");
			}
			if (state.primaryNftMint && state.primaryPositionNftSecret) {
				console.log("Primary NFT and secret already exist, skipping creation");
				return;
			}
			const result = await createPositionNft(context, true);

			state.primaryPositionNftTxId = result.txId;
			state.primaryNftMint = result.nftMint;
			state.primaryPositionNftSecret = result.positionNftSecret;
			const protocolState = state || {};

			// Update database with NFT secrets
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							primaryPositionNftTxId: result.txId,
							primaryNftMint: result.nftMint,
							primaryPositionNftSecret: result.positionNftSecret,
						}),
					},
					$addToSet: {
						nftMinted: result.nftMint,
					},
				},
			);
		},
		rollback: async (context: MigrationContext) => {
			// Not implemented
			throw new Error("Not implemented");
		},
	},
	{
		name: "createSecondaryPositionNft",
		description: "Create secondary position NFT",
		execute: async (context: MigrationContext) => {
			const { state } = context;
			if (!state.primaryPositionNftTxId) {
				throw new Error("Primary position NFT transaction not found in state");
			}
			if (state.secondaryNftMint && state.secondaryPositionNftSecret) {
				console.log("Secondary NFT and secret already exist, skipping creation");
				return;
			}

			const result = await createPositionNft(context, false);

			state.secondaryPositionNftTxId = result.txId;
			state.secondaryNftMint = result.nftMint;
			state.secondaryPositionNftSecret = result.positionNftSecret;
			const protocolState = state || {};

			// Update database with secondary NFT info
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							secondaryPositionNftTxId: result.txId,
							secondaryNftMint: result.nftMint,
							secondaryPositionNftSecret: result.positionNftSecret,
						}),
						secondaryNftMint: result.nftMint,
					},
					$addToSet: {
						nftMinted: result.nftMint,
					},
				},
			);
		},
		rollback: async (context: MigrationContext) => {
			// Not implemented
			throw new Error("Not implemented");
		},
	},
	{
		name: "finalizePositionNft",
		description: "Finalize position NFT",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;
			if (
				!state.primaryNftMint ||
				!state.secondaryNftMint ||
				!state.primaryPositionNftTxId ||
				!state.secondaryPositionNftTxId
			) {
				throw new Error("Primary or secondary NFT mint not found in state");
			}

			const result = await finalizePositionNft(
				context,
				{ txId: state.primaryPositionNftTxId, nftMint: state.primaryNftMint },
				{
					txId: state.secondaryPositionNftTxId,
					nftMint: state.secondaryNftMint,
				},
			);

			// Update state with finalization results
			state.positionNftFinalized = true;
			state.positionNftFinalizedTxId = result.txId;
			state.primaryAmount = result.extraData.primaryAmount;
			state.secondaryAmount = result.extraData.secondaryAmount;
			state.primaryAmountSol = result.extraData.primaryAmountSol;
			state.secondaryAmountSol = result.extraData.secondaryAmountSol;

			return {
				txId: result.txId,
				data: result.extraData,
			};
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "createPool",
		description: "Create a new Meteora pool",
		execute: async (context: MigrationContext) => {
			const { state } = context;
			if (!state.withdrawnAmounts) {
				throw new Error("No withdrawn amounts found for pool creation");
			}

			// Get the primary NFT mint from the database
			const migration = await DB.Migration.findOne({
				contractAddress: state.tokenMint,
			});
			if (!migration?.primaryNftMint) {
				throw new Error("No primary NFT mint found for pool creation");
			}
			const primaryNft = new PublicKey(migration.primaryNftMint);

			const amountToken = new BN(state.withdrawnAmounts.token);
			const amountSol = new BN(state.withdrawnAmounts.sol);
			const result = await createPool(context, amountToken, amountSol, primaryNft);

			// Update state with pool creation results
			state.poolCreationTxId = result.txId;
			state.poolId = result.extraData.poolId;
			state.primaryPosition = result.extraData.primaryPosition;
			const protocolState = state || {};

			// Update database with pool info
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							poolCreationTxId: result.txId,
							poolId: result.extraData.poolId,
							primaryPosition: result.extraData.primaryPosition,
						}),
						marketId: result.extraData.poolId,
					},
				},
			);

			return {
				txId: result.txId,
				data: result.extraData,
			};
		},
		rollback: async (context: MigrationContext) => {
			// No rollback needed for pool creation
			return;
		},
	},
	// createPosition
	{
		name: "createPosition",
		description: "Create a new position in the Meteora pool",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;
			if (!state.poolId) {
				throw new Error("Pool ID not found in state");
			}

			// Get the secondary NFT mint from the database
			const migration = await DB.Migration.findOne({
				contractAddress: state.tokenMint,
			});
			if (!migration?.secondaryNftMint) {
				throw new Error("No secondary NFT mint found for position creation");
			}
			const secondaryNft = new PublicKey(migration.secondaryNftMint);

			const result = await createPosition(context, state.poolId, secondaryNft);

			// Update state with position creation results
			state.secondaryPosition = result.extraData.positionId;
			const protocolState = state || {};
			// save position ID in the database
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							secondaryPosition: result.extraData.positionId,
						}),
					},
					$addToSet: {
						positions: result.extraData.positionId,
					},
				},
			);

			return {
				txId: result.txId,
				data: result.extraData,
			};
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	//addLiquidity
	{
		name: "addLiquidity",
		description: "Add liquidity to the Meteora pool",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;
			if (!state.poolId) {
				throw new Error("Pool ID not found in state");
			}

			const result = await addLiquidity(context, state.poolId);

			// Update state with liquidity addition results
			state.secondaryPosition = result.extraData.positionId;

			return {
				txId: result.txId,
				data: result.extraData,
			};
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "sendNftToManager",
		description: "Send primary NFT to manager multisig",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;
			if (!state.primaryNftMint) {
				throw new Error("Primary NFT mint not found in state");
			}

			const multisigAddress = process.env.ACCOUNT_FEE_MULTISIG;
			if (!multisigAddress) {
				throw new Error("Multisig address not found in environment variables");
			}
			context.state.nftVersion = "2022";

			const txId = await commonSendNftStep.execute(context);
			await recordTransaction(state, "sendNftToManager", txId, {
				multisigAddress,
				primaryNftMint: state.primaryNftMint,
			});
			const protocolState = state || {};

			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							nftSentToManager: true,
							nftSentToManagerAt: new Date(),
							nftSentToManageTxId: txId,
						}),
					},
				},
			);

			// recordTransaction

			return { txId };
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "depositNft",
		description: "Deposit NFT to Meteora vault",
		execute: async (context) => {
			const { state } = context;
			if (!state.primaryNftMint) {
				throw new Error("Primary NFT mint not found in state");
			}

			// Get the token from the database to get the creator address
			const token = await DB.Token.findOne({
				contractAddress: state.tokenMint,
			});
			if (!token?.creator) {
				throw new Error("No creator address found in token database");
			}

			const claimerAddress = new PublicKey(token.creator);
			const { txId } = await depositNftToMeteora(context, state.primaryNftMint, claimerAddress);

			// Update state
			state.nftDeposited = true;
			state.nftDepositedAt = new Date();
			state.primaryNftDepositTxId = txId;
			const protocolState = state || {};
			// Update database
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							nftDeposited: true,
							nftDepositedAt: new Date(),
							primaryNftDepositTxId: txId,
						}),
					},
				},
			);

			return { txId };
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "collectFees",
		description: "Collect fees from Meteora pool",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;
			if (!state.poolId) {
				throw new Error("Pool ID not found in state");
			}

			const result = await commonCollectFeesStep.execute(context);
			const protocolState = state || {};
			// recordTransaction
			await recordTransaction(state, "collectFees", result.txId, {
				poolId: state.poolId,
				primaryPosition: state.primaryPosition,
				secondaryPosition: state.secondaryPosition,
			});
			await DB.Migration.findOneAndUpdate(
				{ contractAddress: state.tokenMint },
				{
					$set: {
						protocolState: JSON.stringify({
							...protocolState,
							"protocolState.feesCollected": true,
							"protocolState.feesCollectedAt": new Date(),
							"protocolState.feesCollectedTxId": result.txId,
						}),
					},
				},
			);

			return {
				txId: result.txId,
			};
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
	{
		name: "finalize",
		description: "Finalize migration",
		execute: async (context: MeteoraMigrationContext) => {
			const { state } = context;
			console.log("Finalizing migration with state:", state);
			if (!state.poolId || !state.primaryNftDepositTxId || !state.nftSentToManageTxId) {
				throw new Error("Required state information not found for finalization");
			}

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

			return {
				txId: "finalize-migration",
				data: {
					poolId: state.poolId,
					primaryPosition: state.primaryPosition,
					secondaryPosition: state.secondaryPosition,
				},
			};
		},
		rollback: async (context: MeteoraMigrationContext) => {
			throw new Error("Not implemented");
		},
	},
];
