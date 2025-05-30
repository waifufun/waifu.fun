import dotenv from "dotenv";

dotenv.config();

const CONFIG = {
  SOLANA_RPC: process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com",
  DATABASE_URL: process.env.DATABASE_URL || "postgres://user:password@localhost:5432/mydb",
  GATEWAY_URL: "https://v2.archive.subsquid.io/network/solana-mainnet",
  START_BLOCK: 336000000,
  RPC_STRIDE_CONCURRENCY: 100,
};

export default CONFIG;