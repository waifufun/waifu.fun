import dotenv from "dotenv";
dotenv.config();
import { SolanaIndexer } from "../indexers/solana-indexer";
import { SolanaNetworkIds, type SolanaAddressLike } from "@autofun/types";
import type { SolanaIndexerConfig } from "../types";

const v2Address =
	process.env.NETWORK === "devnet"
		? "TeStFsfeHHNsCRNo9WaF6eyo5Fzwm2Yiq5mXfhknvxS"
		: "autoiNVyGniA5dosggHy34BZYimthNzLy6WXL7qwzPA";

const config: SolanaIndexerConfig = {
	networkId: process.env.NETWORK === "devnet" ? SolanaNetworkIds.Devnet : SolanaNetworkIds.Mainnet,
	autoFunAddress: v2Address as SolanaAddressLike,
	maxSignatures: 1,
	minBlock: 323781260,
	debugStatements: false,
	maxBlock: Number.POSITIVE_INFINITY,
	version: "v2",
};

// autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5

const configLegacy: SolanaIndexerConfig = {
	networkId: process.env.NETWORK === "devnet" ? SolanaNetworkIds.Devnet : SolanaNetworkIds.Mainnet,
	autoFunAddress: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5" as SolanaAddressLike,
	maxSignatures: 1,
	minBlock: 323781260,
	debugStatements: false,
	maxBlock: Number.POSITIVE_INFINITY,
	version: "legacy",
};
const indexer = new SolanaIndexer(config);
const indexerLegacy = new SolanaIndexer(configLegacy);

const run = async () => {
	try {
		await Promise.all([
			indexer.runWithRealTimeSync().catch((err) => {
				console.error("V2 Indexer failed:", err);
				throw new Error(`V2 Indexer: ${err.message}`);
			}),
			indexerLegacy.runWithRealTimeSync().catch((err) => {
				console.error("Legacy Indexer failed:", err);
				throw new Error(`Legacy Indexer: ${err.message}`);
			}),
		]);
	} catch (error) {
		console.error("One or both indexers failed:", error);
		process.exit(1);
	}
};

run();
