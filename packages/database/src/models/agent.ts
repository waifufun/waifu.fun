import type { IAgent } from "@autofun/types";
import Mongoose, { type Model as ModelType, Schema } from "mongoose";

const schema = new Schema<IAgent, ModelType<IAgent>>(
	{
		name: { type: String, required: true },
		bio: { type: String, required: true },
		createdBy: { type: String, required: true },
		imageUrl: { type: String, required: true },
		relatedTokenAddress: { type: String },
	},
	{ timestamps: true, versionKey: false },
);

const Model = Mongoose.model<IAgent>("Agent", schema);

export default Model;
