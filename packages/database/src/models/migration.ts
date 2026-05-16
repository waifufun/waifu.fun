import type { IMigration } from "@waifufun/types";
import Mongoose, { type Model as ModelType, Schema, type Model as MongooseModel } from "mongoose";
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
		poolKeys: { type: String },
		lockLpTxId: { type: String },
		primaryNftMint: { type: String },
		secondaryNftMint: { type: String },
		status: { type: String, default: "active" },
		protocol: { type: String, required: true },
		protocolState: { type: String, default: "" },
		currentStep: { type: Number, default: 0 },
		lastSuccessfulStep: { type: Number, default: 0 },
		positionIds: [{ type: String }],
		positionNftsSecrets: [{ type: String }],
		nftMinted: [{ type: String }],
		contractAddress: { type: String, required: true },
		chain: { type: String, enum: ["solana", "evm"], required: true },
		chainId: { type: Number, required: true },
		creator: { type: String, required: true },
		version: { type: Number, default: 1, required: true },
		startedAt: { type: Date, default: Date.now },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ contractAddress: 1, chain: 1, chainId: 1 }, { unique: true });
schema.index({ marketId: 1 });

const Model = Mongoose.model<IMigration, MongooseModel<IMigration>>("Migration", schema);

if (process.env.MONGO_URI) {
	Model.createIndexes();
}

export default Model;
