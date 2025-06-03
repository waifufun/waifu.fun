import { SolanaIndexer, } from "../indexers/solana-indexer";
import { SolanaNetworkIds, type SolanaAddressLike } from "@autofun/types";
import type { SolanaIndexerConfig } from "../types";

const config: SolanaIndexerConfig = {
	networkId: SolanaNetworkIds.Mainnet,
	autoFunAddress: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5" as SolanaAddressLike,
	maxSignatures: 70,
	debugStatements: false,
};

const indexer = new SolanaIndexer(config);

(async () => {
	await indexer.runWithRealTimeSync();
})();
