import {
  SolanaIndexer,
  type SolanaIndexerConfig,
} from "../indexers/SolanaIndexer";
import { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";

const config: SolanaIndexerConfig = {
  networkId: SolanaNetworkIds.Mainnet,
  autoFunAddress:
    "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5" as SolanaAddressLike,
  maxSignatures: 70,
  debugStatements: true,
};

const indexer = new SolanaIndexer(config);

(async () => {
  await indexer.runWithSignatures();
})();
