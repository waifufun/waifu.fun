import { Schema } from "mongoose";
import type { IMigration } from "@autofun/types";

const migrationSchema = new Schema<IMigration>(
	{
		withdrawnAt: { type: Date },
		migratedAt: { type: Date },
		marketId: { type: String },
		baseVault: { type: String },
		quoteVault: { type: String },
		withdrawnAmount: { type: Number },
		migration: { type: String },
		withdrawnAmounts: { type: String },
		poolInfo: { type: String },
		lockLpTxId: { type: String },
		status: { type: String, default: "active" },
		positionIds: [{ type: String }],
		positionNftsSecrets: [{ type: String }],
		nftMinted: [{ type: String }],
		contractAddress: { type: String, required: true },
		chain: { type: String, enum: ["solana", "evm"], required: true },
		chainId: { type: Number, required: true },
		creator: { type: String, required: true },
	},
	{
		timestamps: true,
	},
);

export default migrationSchema;
