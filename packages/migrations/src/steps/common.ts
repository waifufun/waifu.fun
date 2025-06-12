import type { MigrationStep, MigrationContext } from "../types";
import { withdrawLiquidity, sendNftToManager, collectProtocolFees } from "../utils/protocol-utils";

export const commonWithdrawStep: MigrationStep = {
	name: "withdraw",
	description: "Withdraw liquidity from pool",
	execute: async (context: MigrationContext) => {
		const { state } = context;
		await withdrawLiquidity(context, state.tokenMint);
	},
	rollback: async (context: MigrationContext) => {
		throw new Error("Not implemented");
	},
};

export const commonSendNftStep: MigrationStep = {
	name: "sendNft",
	description: "Send NFT to manager multisig",
	execute: async (context: MigrationContext) => {
		const { state } = context;
		const { primaryNftMint } = state;
		const version = state.nftVersion || "legacy";
		if (!primaryNftMint) {
			throw new Error("NFT mint not found in state");
		}
		const multisigAddress = process.env.ACCOUNT_FEE_MULTISIG;
		if (!multisigAddress) {
			throw new Error("Multisig address not found in environment variables");
		}
		console.log(`Sending NFT to multisig: ${multisigAddress}, version: ${version}, nft mint: ${primaryNftMint}`);
		const txId = await sendNftToManager(context, primaryNftMint, multisigAddress, version);
		state.txId = txId;

		return txId;
	},
	rollback: async (context: MigrationContext) => {
		throw new Error("Not implemented");
	},
};

export const commonCollectFeesStep: MigrationStep = {
	name: "collectFees",
	description: "Collect protocol fees",
	execute: async (context: MigrationContext) => {
		const { state } = context;
		const { nftDeposited } = state;
		if (!nftDeposited) {
			throw new Error("NFT not deposited");
		}
		const result = await collectProtocolFees(context, state.tokenMint);
		state.txId = result.txId;
		return result;
	},
	rollback: async (context: MigrationContext) => {
		throw new Error("Not implemented");
	},
};
