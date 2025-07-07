import Mongoose, { type Model as ModelType, Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";
import type { IPresale } from "@autofun/types";

const schema = new Schema<IPresale, ModelType<IPresale>>(
	{
		contractAddress: { type: String, required: true },
		chain: { type: String, required: true },
		chainId: { type: Number, required: true },
		name: { type: String, required: true },
		symbol: { type: String, required: true },
		image: { type: String, required: true },
		description: { type: String, required: true },
		totalSupply: { type: Number, required: true },
		decimals: { type: Number, required: true, default: 9 },

		// Presale specific info
		presaleAddress: { type: String },
		creator: { type: String, required: true },
		status: {
			type: String,
			required: true,
			enum: ["draft", "active", "paused", "completed", "cancelled", "failed"],
			default: "draft",
		},

		// Tokenomics
		tokenomics: {
			presaleAllocation: { type: Number, required: true },
			liquidityAllocation: { type: Number, required: true },
			teamAllocation: { type: Number, required: true },
			marketingAllocation: { type: Number, required: true },
			developmentAllocation: { type: Number, required: true },
			communityAllocation: { type: Number, required: true },
			otherAllocation: { type: Number },
			vestingSchedule: {
				teamVesting: {
					percentage: { type: Number },
					cliff: { type: Number },
					duration: { type: Number },
				},
				marketingVesting: {
					percentage: { type: Number },
					cliff: { type: Number },
					duration: { type: Number },
				},
			},
		},

		// Raise information
		raise: {
			targetAmount: { type: Number, required: true },
			targetAmountUsd: { type: Number },
			minimumRaise: { type: Number, required: true },
			minimumRaiseUsd: { type: Number },
			maximumRaise: { type: Number, required: true },
			maximumRaiseUsd: { type: Number },
			raisedAmount: { type: Number, default: 0 },
			raisedAmountUsd: { type: Number },
			softCap: { type: Number, required: true },
			softCapUsd: { type: Number },
			hardCap: { type: Number, required: true },
			hardCapUsd: { type: Number },
			pricePerToken: { type: Number, required: true },
			pricePerTokenUsd: { type: Number },
			targetMarketcap: { type: Number },
			targetMarketcapUsd: { type: Number },
			currency: {
				type: String,
				required: true,
				enum: ["USDT", "USDC", "ETH", "SOL", "BNB"],
				default: "USDT",
			},
			currencyAddress: { type: String },
		},

		// Presale schedule
		schedule: {
			startDate: { type: Date, required: true },
			endDate: { type: Date, required: true },
			claimDate: { type: Date },
			vestingStartDate: { type: Date },
		},

		// Allocations breakdown
		allocations: {
			presale: {
				percentage: { type: Number, required: true },
				amount: { type: Number, required: true },
				price: { type: Number, required: true },
			},
			liquidity: {
				percentage: { type: Number, required: true },
				amount: { type: Number, required: true },
				lockDuration: { type: Number, required: true },
			},
			team: {
				percentage: { type: Number },
				amount: { type: Number },
				vestingMonths: { type: Number },
			},
			marketing: {
				percentage: { type: Number },
				amount: { type: Number },
				vestingMonths: { type: Number },
			},
			development: {
				percentage: { type: Number },
				amount: { type: Number },
				vestingMonths: { type: Number },
			},
			community: {
				percentage: { type: Number },
				amount: { type: Number },
			},
			staking: {
				percentage: { type: Number },
				amount: { type: Number },
				lockDuration: { type: Number },
				apy: { type: Number },
			},
			reserves: {
				percentage: { type: Number },
				amount: { type: Number },
				purpose: { type: String },
			},
			vc: {
				rounds: [
					{
						round: { type: String, required: true },
						percentage: { type: Number, required: true },
						amount: { type: Number, required: true },
						price: { type: Number, required: true },
						vestingMonths: { type: Number, required: true },
						cliffMonths: { type: Number, required: true },
						investors: [{ type: String }],
					},
				],
				totalPercentage: { type: Number, required: true },
				totalAmount: { type: Number, required: true },
			},
		},

		// Utility and features
		utility: {
			description: { type: String, required: true },
			features: [{ type: String }],
			useCases: [{ type: String }],
			benefits: [{ type: String }],
		},

		// Roadmap
		roadmap: {
			phases: [
				{
					phase: { type: String, required: true },
					title: { type: String, required: true },
					description: { type: String, required: true },
					estimatedDate: { type: Date, required: true },
					completed: { type: Boolean, default: false },
					milestones: [{ type: String }],
				},
			],
		},

		// Team information
		team: {
			members: [
				{
					name: { type: String, required: true },
					role: { type: String, required: true },
					avatar: { type: String },
					linkedin: { type: String },
					twitter: { type: String },
					github: { type: String },
				},
			],
			description: { type: String, required: true },
		},

		// Social links and marketing
		socials: {
			website: { type: String },
			twitter: { type: String },
			telegram: { type: String },
			discord: { type: String },
			medium: { type: String },
			github: { type: String },
			linkedin: { type: String },
			youtube: { type: String },
			whitepaper: { type: String },
		},

		// KYC and audit information
		kyc: {
			completed: { type: Boolean, default: false },
			provider: { type: String },
			reportUrl: { type: String },
			completedAt: { type: Date },
		},

		audit: {
			completed: { type: Boolean, default: false },
			provider: { type: String },
			reportUrl: { type: String },
			completedAt: { type: Date },
		},

		// Presale participation
		participants: [
			{
				address: { type: String, required: true },
				amount: { type: Number, required: true },
				tokens: { type: Number, required: true },
				participatedAt: { type: Date, required: true },
				claimed: { type: Boolean, default: false },
				claimedAt: { type: Date },
				signature: { type: String },
				refunded: { type: Boolean, default: false },
				refundedAt: { type: Date },
			},
		],

		// Additional settings
		settings: {
			minimumInvestment: { type: Number, required: true },
			maximumInvestment: { type: Number, required: true },
			refundable: { type: Boolean, default: false },
			whitelistRequired: { type: Boolean, default: false },
			whitelistAddresses: [{ type: String }],
			kycRequired: { type: Boolean, default: false },
			vestingEnabled: { type: Boolean, default: false },
		},

		// Statistics
		stats: {
			totalParticipants: { type: Number, default: 0 },
			totalInvested: { type: Number, default: 0 },
			totalInvestedUsd: { type: Number },
			averageInvestment: { type: Number, default: 0 },
			averageInvestmentUsd: { type: Number },
			largestInvestment: { type: Number, default: 0 },
			largestInvestmentUsd: { type: Number },
			smallestInvestment: { type: Number, default: 0 },
			smallestInvestmentUsd: { type: Number },
			completionPercentage: { type: Number, default: 0 },
		},

		// Metadata
		metadataUrl: { type: String },
		hidden: { type: Boolean, default: false },
		featured: { type: Boolean, default: false },
		verified: { type: Boolean, default: false },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

// Indexes for efficient querying
schema.index({ contractAddress: 1, chain: 1, chainId: 1 }, { unique: true });
schema.index({ creator: 1 });
schema.index({ status: 1 });
schema.index({ "schedule.startDate": 1 });
schema.index({ "schedule.endDate": 1 });
schema.index({ featured: 1, status: 1 });
schema.index({ hidden: 1, status: 1 });
schema.index({ verified: 1, status: 1 });
schema.index({ "raise.currency": 1, status: 1 });
schema.index({ createdAt: -1 });
schema.index({ "stats.completionPercentage": -1 });
schema.index({ name: "text", symbol: "text", description: "text" });

const Model = Mongoose.model<IPresale, PaginateModel<IPresale>>("Presale", schema);

Model.createIndexes();

export default Model;
