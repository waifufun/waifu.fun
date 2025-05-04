import type { IToken } from "@autofun/types";
import Mongoose, { Schema } from "mongoose";

const schema = new Schema<IToken, Mongoose.Model<IToken>>(
  {
    contractAddress: { type: String, required: true },
    chain: { type: String, required: true },
    chainId: { type: Number, required: true },
    name: { type: String, required: true },
    ticker: { type: String, required: true },
    image: { type: String, required: true },
    price: { type: Number, default: 0 },
    imported: { type: Boolean, default: false},
    marketcap: { type: Number, default: 0 },
    volume24h: { type: Number, default: 0 },
    totalSupply: { type: Number, required: true, default: 0 },
    socials: {
      twitter: { type: String },
      website: { type: String },
      discord: { type: String },
      telegram: { type: String },
    },
    transactionHash: { type: String, required: true },
    hidden: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    creator: { type: String, required: true },
  },
  { timestamps: true }
);

schema.index({ contractAddress: 1 }, { unique: true });

const Model = Mongoose.model<IToken, Mongoose.Model<IToken>>("Token", schema);

export default Model;
