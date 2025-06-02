import type { IMigration } from "@autofun/types";
import Mongoose, { type Model as ModelType, Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IMigration, ModelType<IMigration>>(
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
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ contractAddress: 1, chain: 1, chainId: 1 }, { unique: true });
schema.index({ marketId: 1 });

const Model = Mongoose.model<IMigration, PaginateModel<IMigration>>("Migration", schema);

Model.createIndexes();

export default Model;
