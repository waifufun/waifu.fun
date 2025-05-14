import type { IChatMessage, } from "@autofun/types";
import Mongoose, { type Model as ModelType, Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IChatMessage, ModelType<IChatMessage>>(
	{
		contractAddress: { type: String },
		sender: { type: String },
		room: { type: Number, enum: [1000, 100_000, 1_000_000] },
		image: { type: String },
		message: { type: String },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ contractAddress: 1 });
schema.index({ contractAddress: 1, room: 1 });

const Model = Mongoose.model<IChatMessage, PaginateModel<IChatMessage>>("ChatMessage", schema);

Model.createIndexes();

export default Model;
