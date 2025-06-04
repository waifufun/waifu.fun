import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import type { MigrationStep, MigrationContext } from "../types";
import {
  commonWithdrawStep,
  commonSendNftStep,
  commonCollectFeesStep,
} from "../steps/common";
import { withdrawLiquidity, recordTransaction } from "../utils/protocol-utils";
import BN from 'bn.js';
import {
  createPositionNft,
  finalizePositionNft,
  createPool,
  createPosition,
  addLiquidity,
  depositNftToMeteora,
} from "./meteora/calls";
import DB from "@autofun/database";

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
      if (!state.poolCreationTxId) {
        throw new Error("Pool creation transaction not found in state");
      }

      const result = await createPositionNft(context, true);

      state.primaryPositionNftTxId = result.txId;
      state.primaryNftMint = result.nftMint;
      state.primaryPositionNftSecret = result.positionNftSecret;

      
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
      if (!state.poolCreationTxId) {
        throw new Error("Pool creation transaction not found in state");
      }

      const result = await createPositionNft(context, false);

      state.secondaryPositionNftTxId = result.txId;
      state.secondaryNftMint = result.nftMint;
      state.secondaryPositionNftSecret = result.positionNftSecret;
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
      if (!state.primaryNftMint || !state.secondaryNftMint) {
        throw new Error("Primary or secondary NFT mint not found in state");
      }

      const result = await finalizePositionNft(
        context,
        { txId: state.primaryPositionNftTxId!, nftMint: state.primaryNftMint },
        {
          txId: state.secondaryPositionNftTxId!,
          nftMint: state.secondaryNftMint,
        }
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

      const primaryTokens = new BN(state.withdrawnAmounts.token);
      const primarySol = new BN(state.withdrawnAmounts.sol);

      // Get the primary NFT mint from the database
      const migration = await DB.Migration.findOne({
        contractAddress: state.tokenMint,
      });
      if (!migration?.primaryNftMint) {
        throw new Error("No primary NFT mint found for pool creation");
      }
      const primaryNft = new PublicKey(migration.primaryNftMint);

      const result = await createPool(
        context,
        primaryTokens,
        primarySol,
        primaryNft
      );

      // Update state with pool creation results
      state.poolCreationTxId = result.txId;
      state.poolId = result.extraData.poolId;
      state.primaryPosition = result.extraData.primaryPosition;

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
  commonSendNftStep,
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
      const { txId } = await depositNftToMeteora(
        context,
        state.primaryNftMint,
        claimerAddress
      );

      // Update state
      state.nftDeposited = true;
      state.nftDepositedAt = new Date();
      state.primaryNftDepositTxId = txId;

      // Update database
      await DB.Migration.findOneAndUpdate(
        { contractAddress: state.tokenMint },
        {
          $set: {
            "protocolState.nftDeposited": true,
            "protocolState.nftDepositedAt": new Date(),
            "protocolState.primaryNftDepositTxId": txId,
          },
        }
      );

      return { txId };
    },
    rollback: async (context: MeteoraMigrationContext) => {
      throw new Error("Not implemented");
    },
  },
  commonCollectFeesStep,
  {
    name: "finalize",
    description: "Finalize migration",
    execute: async (context: MeteoraMigrationContext) => {
      const { state } = context;
      if (!state.poolId || !state.primaryPosition || !state.secondaryPosition) {
        throw new Error(
          "Required state information not found for finalization"
        );
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
        }
      );
      // Update token status in database
      await DB.Token.findOneAndUpdate(
        { mint: state.tokenMint },
        {
          $set: {
            status: "finalized",
            updatedAt: new Date(),
          },
        }
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
