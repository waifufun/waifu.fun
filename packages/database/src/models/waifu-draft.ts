/**
 * WaifuDraft Mongoose model.
 *
 * Stores the canonical draft object used for both native-create (Flap) and
 * import flows.  Sections mirror the IWaifuDraft interface in the backend
 * types package.
 */

import Mongoose, { Schema } from "mongoose";

// We define the schema shape locally rather than importing the backend type
// to avoid a circular dependency (database package should not depend on backend).

const FlapLaunchConfigSchema = new Schema(
	{
		metadataUri: { type: String },
		totalSupply: { type: Number },
		decimals: { type: Number },
		maxBuyAmount: { type: Number },
		delayForTrade: { type: Number },
		curveVersion: { type: Number },
		isToken2022: { type: Boolean },
	},
	{ _id: false },
);

const ImportedTokenConfigSchema = new Schema(
	{
		contractAddress: { type: String, required: true },
		chain: { type: String, required: true },
		chainId: { type: Number, required: true },
		curveCompleted: { type: Boolean },
		pool: { type: String },
		metadataUri: { type: String },
		totalSupply: { type: Number },
		decimals: { type: Number },
		isToken2022: { type: Boolean },
		originalCreator: { type: String },
	},
	{ _id: false },
);

const SocialsSchema = new Schema(
	{
		twitter: { type: String },
		telegram: { type: String },
		discord: { type: String },
		website: { type: String },
		farcaster: { type: String },
	},
	{ _id: false },
);

const EntrySchema = new Schema(
	{
		mode: { type: String, enum: ["create", "import"], required: true },
		createdAt: { type: String },
		referral: { type: String },
	},
	{ _id: false },
);

const IdentitySchema = new Schema(
	{
		name: { type: String },
		ticker: { type: String },
		description: { type: String },
		image: { type: String },
		imageKey: { type: String },
		socials: { type: SocialsSchema },
	},
	{ _id: false },
);

const TokenSchema = new Schema(
	{
		provenance: { type: String, enum: ["flap", "imported"], required: true },
		chain: { type: String },
		chainId: { type: Number },
		flapConfig: { type: FlapLaunchConfigSchema },
		importedConfig: { type: ImportedTokenConfigSchema },
	},
	{ _id: false },
);

const RuntimeSchema = new Schema(
	{
		agentTemplate: { type: String },
		cloudProvider: { type: String },
		runtimeOverrides: { type: Schema.Types.Mixed },
	},
	{ _id: false },
);

const OwnerSchema = new Schema(
	{
		walletAddress: { type: String, required: true },
		displayName: { type: String },
		billingTier: { type: String },
	},
	{ _id: false },
);

const ReviewSchema = new Schema(
	{
		status: {
			type: String,
			enum: ["draft", "pending_review", "approved", "active", "rejected", "archived"],
			default: "draft",
			required: true,
		},
		rejectionReason: { type: String },
		reviewedBy: { type: String },
		reviewedAt: { type: String },
		activationPayload: { type: Schema.Types.Mixed },
	},
	{ _id: false },
);

// biome-ignore lint/suspicious/noExplicitAny: Mongoose generic requires any for lean doc type
const waifuDraftSchema = new Schema<any>(
	{
		entry: { type: EntrySchema, required: true },
		identity: { type: IdentitySchema, default: () => ({}) },
		token: { type: TokenSchema, required: true },
		runtime: { type: RuntimeSchema, default: () => ({}) },
		owner: { type: OwnerSchema, required: true },
		review: { type: ReviewSchema, default: () => ({ status: "draft" }) },
	},
	{ timestamps: true, versionKey: false },
);

// Indexes
waifuDraftSchema.index({ "owner.walletAddress": 1, "review.status": 1 });
waifuDraftSchema.index({ "review.status": 1, updatedAt: -1 });
waifuDraftSchema.index({ "token.importedConfig.contractAddress": 1 }, { sparse: true });

const WaifuDraft = Mongoose.model("WaifuDraft", waifuDraftSchema);

WaifuDraft.createIndexes();

export default WaifuDraft;
