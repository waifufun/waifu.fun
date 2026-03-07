import Mongoose, { type Model as ModelType, Schema } from "mongoose";

export interface ILaunchGateAllowlistEntry {
	walletAddress: string;
	addedBy?: string;
	createdAt?: Date;
	updatedAt?: Date;
}

const schema = new Schema<ILaunchGateAllowlistEntry, ModelType<ILaunchGateAllowlistEntry>>(
	{
		walletAddress: { type: String, required: true, unique: true, trim: true },
		addedBy: { type: String },
	},
	{ timestamps: true, versionKey: false },
);

schema.index({ walletAddress: 1 }, { unique: true });

const Model = Mongoose.model<ILaunchGateAllowlistEntry>("LaunchGateAllowlist", schema);

Model.createIndexes();

export default Model;
