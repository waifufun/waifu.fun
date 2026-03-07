import Mongoose, { type Model as ModelType, Schema } from "mongoose";

export interface IInviteCode {
	code: string;
	maxUses: number;
	usedCount: number;
	usedBy: string[];
	createdBy: string;
	expiresAt?: Date;
	active: boolean;
	createdAt?: Date;
	updatedAt?: Date;
}

const schema = new Schema<IInviteCode, ModelType<IInviteCode>>(
	{
		code: { type: String, required: true, unique: true, uppercase: true, trim: true },
		maxUses: { type: Number, required: true, min: 1 },
		usedCount: { type: Number, default: 0 },
		usedBy: [{ type: String }],
		createdBy: { type: String, required: true },
		expiresAt: { type: Date },
		active: { type: Boolean, default: true },
	},
	{ timestamps: true, versionKey: false },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ active: 1, expiresAt: 1 });
schema.index({ usedBy: 1 });

const Model = Mongoose.model<IInviteCode>("InviteCode", schema);

Model.createIndexes();

export default Model;
