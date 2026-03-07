import path from "node:path";
import { fileURLToPath } from "node:url";
import logger from "@waifufun/logger";
import { Command } from "commander";
import dotenv from "dotenv";
import { ControlPlaneBackfill } from "./control-plane-backfill.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "../../..");

for (const envFile of [".env", ".env.local"]) {
	dotenv.config({
		path: path.join(repoRoot, envFile),
		override: false,
	});
}

const program = new Command();

program.name("sync").description("Data sync and backfill helpers for waifu.fun").version("1.0.0");

program
	.command("tokens")
	.description("Sync tokens from PostgreSQL to MongoDB")
	.option("-b, --batch-size <number>", "Number of tokens to sync in each batch", "100")
	.action(async (options) => {
		try {
			const pgConnectionString = process.env.DATABASE_URL;
			if (!pgConnectionString) {
				throw new Error("DATABASE_URL environment variable is not set");
			}

			const { DataSync } = await import("./sync.js");
			const sync = new DataSync(pgConnectionString);
			await sync.syncTokens(Number.parseInt(options.batchSize, 10));
			await sync.close();
			logger.info("Token sync completed successfully");
		} catch (error) {
			console.error("Error during token sync:", error);
			process.exit(1);
		}
	});

program
	.command("control-plane")
	.description("Backfill canonical Supabase control-plane state from MongoDB")
	.option("--mongo-uri <uri>", "MongoDB connection string", process.env.MONGO_URI)
	.option(
		"--postgres-url <url>",
		"Destination Postgres connection string",
		process.env.SUPABASE_DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL,
	)
	.option("--batch-size <number>", "Rows per batch", "250")
	.option("--limit <number>", "Limit documents per collection (for validation)")
	.option(
		"--default-solana-chain-id <number>",
		"Fallback chain id for legacy wallet-only Solana records",
		process.env.WAIFU_DEFAULT_SOLANA_CHAIN_ID ?? "101",
	)
	.option(
		"--default-evm-chain-id <number>",
		"Fallback chain id for legacy wallet-only EVM records",
		process.env.WAIFU_DEFAULT_EVM_CHAIN_ID ?? "8453",
	)
	.option("--dry-run", "Plan the backfill without writing to Postgres", false)
	.action(async (options) => {
		try {
			if (!options.mongoUri) {
				throw new Error("MONGO_URI (or --mongo-uri) is required");
			}

			if (!options.postgresUrl) {
				throw new Error("DATABASE_URL/SUPABASE_DATABASE_URL (or --postgres-url) is required");
			}

			const backfill = new ControlPlaneBackfill({
				mongoUri: options.mongoUri,
				postgresUrl: options.postgresUrl,
				batchSize: Number.parseInt(options.batchSize, 10),
				limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
				defaultSolanaChainId: Number.parseInt(options.defaultSolanaChainId, 10),
				defaultEvmChainId: Number.parseInt(options.defaultEvmChainId, 10),
				dryRun: Boolean(options.dryRun),
			});

			const summary = await backfill.run();
			console.log(JSON.stringify(summary, null, 2));
		} catch (error) {
			console.error("Error during canonical control-plane backfill:", error);
			process.exit(1);
		}
	});

program.parse();
