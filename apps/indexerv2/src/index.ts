import {
  SolanaIndexer,
  type SolanaIndexerConfig,
} from "../indexers/SolanaIndexer";
import { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";

const config: SolanaIndexerConfig = {
  networkId: SolanaNetworkIds.Mainnet,
  autoFunAddress:
    "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5" as SolanaAddressLike,
  batchSize: 100,
};

const indexer = new SolanaIndexer(config);

(async () => {
  await indexer.runWithSignatures();
})();
