import {
  SolanaIndexer,
  type SolanaIndexerConfig,
} from "../indexers/SolanaIndexer";
import { SolanaNetworkIds } from "@autofun/types";

const config: SolanaIndexerConfig = {
  networkId: SolanaNetworkIds.Mainnet,
  autoFunAddress: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5",
  startSlot: 336725834, // SQUID launch block
  endSlot: 336726034, // SQUID launch block
  batchSize: 100,
};

const indexer = new SolanaIndexer(config);

(async () => {
  await indexer.run();
})();
