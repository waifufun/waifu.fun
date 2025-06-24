import type { IToken } from "@autofun/types";
import Mongoose, { type Model as ModelType, Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IToken, ModelType<IToken>>(
	{
		contractAddress: { type: String, required: true },
		chain: { type: String, required: true },
		chainId: { type: Number, required: true },
		name: { type: String, required: true },
		ticker: { type: String, required: true },
		image: { type: String, required: true },
		price: { type: Number, default: 0 },
		description: { type: String },
		imported: { type: Boolean, default: false },
		decimals: { type: Number, required: true },
		marketcap: { type: Number, default: 0 },
		volume24h: { type: Number, default: 0 },
		curveCompleted: { type: Boolean },
		curveProgress: { type: Number },
		bondingCurveAddress: { type: String },
		curveLimit: { type: Number },
		holders: { type: Number, default: 0 },
		verified: { type: Boolean, default: false },
		totalSupply: { type: Number, required: true, default: 0 },
		reserveAmount: { type: Number },
		reserveLamport: { type: Number },
		bondingCurveBalance: { type: Number },
		virtualReserves: { type: Number },
		socials: {
			twitter: { type: String },
			website: { type: String },
			discord: { type: String },
			telegram: { type: String },
		},
		hidden: { type: Boolean, default: false },
		featured: { type: Boolean, default: false },
		creator: { type: String },
		status: { type: String, default: "active" },
		pool: { type: String },
		isToken2022: { type: Boolean, default: false },
		createdAt: { type: Date, default: () => Date.now() },
		updatedAt: { type: Date, default: Date.now },
		tradingStartsAt: { type: Date },
		lastClaimedAt: { type: Date },
		maxBuyAmount: { type: Number },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ contractAddress: 1, chain: 1, chainId: 1 }, { unique: true });
schema.index({ hidden: 1, contractAddress: 1, chain: 1, chainId: 1 });
schema.index({ hidden: 1, contractAddress: 1 });
schema.index({ name: "text", ticker: "text", contractAddress: "text" });
schema.index({ createdAt: -1 });
const Model = Mongoose.model<IToken, PaginateModel<IToken>>("Token", schema);

Model.createIndexes();

export default Model;
