import { SolanaIndexer, type SolanaIndexerConfig } from "../indexers/SolanaIndexer";
import { SolanaNetworkIds, type SolanaAddressLike } from "@autofun/types";

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
