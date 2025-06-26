import type { IUser } from "@autofun/types";
import Mongoose, { type Model as ModelType, Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IUser, ModelType<IUser>>(
	{
		address: { type: String, required: true },
		suspended: { type: Boolean, default: false },
		displayName: { type: String },
		avatar: { type: String },
		verified: { type: Boolean, default: false },
		twitter: { type: String },
		points: { type: Number, default: 0 },
		weekly_points: { type: Number, default: 0 },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ address: 1 }, { unique: true });
schema.index({ address: 1, suspended: 1 });

const Model = Mongoose.model<IUser, PaginateModel<IUser>>("User", schema);

Model.createIndexes();

export default Model;
