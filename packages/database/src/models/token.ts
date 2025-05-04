import type { IToken } from "@autofun/types";
import Mongoose, { Schema } from "mongoose";

const schema = new Schema<IToken, Mongoose.Model<IToken>>(
  {
    contractAddress: { type: String },
    chain: { type: String },
    chainId: { type: Number },
    name: { type: String },
    ticker: { type: String },
    image: { type: String },
    price: { type: Number },
    totalSupply: { type: Number },
    socials: {
      twitter: { type: String },
      website: { type: String },
      discord: { type: String },
      telegram: { type: String },
    },
    transactionHash: { type: String },
    creator: { type: String },
  },
  { timestamps: true }
);

schema.index({ contractAddress: 1 }, { unique: true });

const Model = Mongoose.model<IToken, Mongoose.Model<IToken>>("Token", schema);

export default Model;
