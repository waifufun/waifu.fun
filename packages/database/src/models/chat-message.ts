import type { IChatMessage } from "@waifufun/types";
import Mongoose, { type Model as ModelType, Schema, type Model as MongooseModel } from "mongoose";
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

const Model = Mongoose.model<IChatMessage, MongooseModel<IChatMessage>>("ChatMessage", schema);

if (process.env.MONGO_URI) {
	Model.createIndexes();
}

export default Model;
