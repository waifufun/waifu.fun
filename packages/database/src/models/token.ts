import type { IToken } from "@waifufun/types";
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
		launchType: { type: String, enum: ["native", "imported"] },
		launchPlatform: { type: String, enum: ["pump", "flap", "external"] },
		ownerClaimStatus: { type: String, enum: ["unclaimed", "claimed", "verified", "disputed"] },
		creatorUserId: { type: String },
		ownerWallets: {
			solana: [{ type: String }],
			evm: [{ type: String }],
		},
		agentCharacterConfig: {
			name: { type: String },
			bio: { type: String },
			avatar: { type: String },
		},
		cloudAgentId: { type: String },
		agentStatus: {
			type: String,
			enum: ["none", "provisioning", "running", "suspended", "failed", "deleted"],
			default: "none",
		},
		agentLifecycleState: { type: String, enum: ["birth", "live", "dormant", "reviving"] },
		billingMode: { type: String, enum: ["owner_credits", "waifu_treasury_subsidy", "hybrid"] },
		infraReserveUsd: { type: Number },
		decimals: { type: Number, required: true },
		marketcap: { type: Number, default: 0 },
		volume24h: { type: Number, default: 0 },
		curveCompleted: { type: Boolean },
		curveProgress: { type: Number },
		bondingCurveAddress: { type: String },
		curveLimit: { type: Number },
		holders: { type: Number, default: 0 },
		verified: { type: Boolean, default: false },
		totalSupply: { type: Number, required: true, default: 1000000000000000 },
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
		metadataUrl: { type: String },
		hidden: { type: Boolean, default: false },
		featured: { type: Boolean, default: false },
		creator: { type: String },
		status: { type: String, default: "active" },
		pool: { type: String },
		isToken2022: { type: Boolean, default: false },
		tradingStartsAt: { type: Date },
		lastClaimedAt: { type: Date },
		lastTradeAt: { type: Date },
		suspendAt: { type: Date },
		reviveAt: { type: Date },
		webUiUrl: { type: String },
		maxBuyAmount: { type: Number },
		version: { type: Number, default: 1 },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ contractAddress: 1, chain: 1, chainId: 1 }, { unique: true });
schema.index({ hidden: 1, contractAddress: 1, chain: 1, chainId: 1 });
schema.index({ hidden: 1, contractAddress: 1 });
schema.index({ imported: 1, createdAt: -1, hidden: 1 });
schema.index({ imported: 1, marketcap: -1, hidden: 1 });
schema.index({ imported: 1, volume24h: -1, marketcap: -1, hidden: 1 });

schema.index({ name: "text", ticker: "text", contractAddress: "text" });
schema.index({ createdAt: -1 });
schema.index({ agentStatus: 1, agentLifecycleState: 1 });
schema.index({ cloudAgentId: 1 });
schema.index({ lastTradeAt: -1 });
const Model = Mongoose.model<IToken, PaginateModel<IToken>>("Token", schema);

Model.createIndexes();

export default Model;
