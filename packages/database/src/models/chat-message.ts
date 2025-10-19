import type { IChatMessage } from "@autofun/types";
import Mongoose, { type Model as ModelType, Schema, type PaginateModel } from "mongoose";
import paginate from "mongoose-paginate-v2";

const schema = new Schema<IChatMessage, ModelType<IChatMessage>>(
	{
		contractAddress: { type: String },
		sender: { type: String, required: true },
		room: { type: String, enum: ["1000", "100000", "1000000"] },
		image: { type: String },
		message: { type: String },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

schema.index({ contractAddress: 1 });
schema.index({ contractAddress: 1, room: 1 });

const Model = Mongoose.model<IChatMessage, PaginateModel<IChatMessage>>("ChatMessage", schema);


export default Model;
