import dotenv from "dotenv";
dotenv.config();
import { SolanaIndexer } from "../indexers/solana-indexer";
import { SolanaNetworkIds, type SolanaAddressLike } from "@autofun/types";
import type { SolanaIndexerConfig } from "../types";

const config: SolanaIndexerConfig = {
	networkId: SolanaNetworkIds.Devnet,
	autoFunAddress: "3KwYy1KF1WYfpM9gmLUgi5mhhvQpKgHwBP2rg4KXnGh5" as SolanaAddressLike,
	maxSignatures: 70,
	debugStatements: true,
};

const indexer = new SolanaIndexer(config);

const run = async () => {
	await indexer.runWithRealTimeSync();
};

run();
