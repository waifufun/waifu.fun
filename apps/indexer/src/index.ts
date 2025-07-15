import dotenv from "dotenv";
dotenv.config();
import { SolanaIndexer } from "../indexers/solana-indexer";
import { SolanaNetworkIds, type SolanaAddressLike } from "@autofun/types";
import type { SolanaIndexerConfig } from "../types";

const config: SolanaIndexerConfig = {
	networkId: process.env.NETWORK === "devnet" ? SolanaNetworkIds.Devnet : SolanaNetworkIds.Mainnet,
	autoFunAddress: "TeStFsfeHHNsCRNo9WaF6eyo5Fzwm2Yiq5mXfhknvxS" as SolanaAddressLike,
	maxSignatures: 70,
	debugStatements: true,
};

const indexer = new SolanaIndexer(config);

const run = async () => {
	await indexer.runWithRealTimeSync();
};

run();
