import type { IAgent } from "@autofun/types";
import Mongoose, { Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IAgent>(
	{
		name: { type: String, required: true },
		bio: { type: String },
		createdBy: { type: String, required: true },
		avatar: { type: String, required: true },
		contractAddress: {
			type: String,
			required: true
		},
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

const Model = Mongoose.model<IAgent, PaginateModel<IAgent>>("Agent", schema);

Model.createIndexes();

export default Model;
