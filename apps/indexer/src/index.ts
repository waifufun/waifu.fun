import dotenv from "dotenv";
dotenv.config();
import { SolanaIndexer } from "../indexers/solana-indexer";
import { SolanaNetworkIds, type SolanaAddressLike } from "@autofun/types";
import type { SolanaIndexerConfig } from "../types";

const config: SolanaIndexerConfig = {
	networkId: process.env.NETWORK === "devnet" ? SolanaNetworkIds.Devnet : SolanaNetworkIds.Mainnet,
	autoFunAddress: "autoiNVyGniA5dosggHy34BZYimthNzLy6WXL7qwzPA" as SolanaAddressLike,
	autoFunAddressLegacy: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5" as SolanaAddressLike,
	maxSignatures: 10,
	debugStatements: false,
	maxBlock: {
		legacy: 353572944,
		v2: Number.POSITIVE_INFINITY,
	},
};

const indexer = new SolanaIndexer(config);

const run = async () => {
	await indexer.runWithRealTimeSync();
};

run();
