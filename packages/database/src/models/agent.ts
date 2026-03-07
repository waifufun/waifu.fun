import type { IAgent } from "@waifufun/types";
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
			required: true,
		},
		chain: { type: String, required: true },
		chainId: { type: Number, required: true },
		cloudAgentId: { type: String },
		runtimeProvider: { type: String, enum: ["milady-cloud"] },
		agentStatus: { type: String },
		webUiUrl: { type: String },
		bridgeUrl: { type: String },
		lastHeartbeatAt: { type: Date },
		billingMode: { type: String },
		suspendedReason: { type: String },
	},
	{ timestamps: true, versionKey: false },
);

schema.plugin(paginate);

const Model = Mongoose.model<IAgent, PaginateModel<IAgent>>("Agent", schema);

export default Model;
