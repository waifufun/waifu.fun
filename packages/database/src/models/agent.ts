import type { IAgent } from "@autofun/types";
import Mongoose, { Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IAgent>(
	{
		name: { type: String, required: true },
		bio: { type: String },
		createdBy: { type: String, required: true },
		image: { type: String, required: true },
		tokenAddress: {
			type: String,
			ref: "Token",
		},
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ relatedTokenAddress: 1 });

const Model = Mongoose.model<IAgent, PaginateModel<IAgent>>("Agent", schema);

Model.createIndexes();

export default Model;
