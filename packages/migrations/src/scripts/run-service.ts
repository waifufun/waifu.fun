// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import { dirname } from "path";
// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import { fileURLToPath } from "url";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import DB from "@waifufun/database";
import redis from "@waifufun/redis";
import * as dotenv from "dotenv";
import { MigrationService } from "../services/migration-service.js";
import { Wallet } from "../utils/customWallet.js";
import { getRpcUrl } from "../utils/getRpcUrl.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

async function main() {
	const rpcUrl = getRpcUrl();
	const connection = new Connection(rpcUrl, "confirmed");

	const rawKey = process.env.EXECUTOR_PRIVATE_KEY;
	if (!rawKey) {
		throw new Error("EXECUTOR_PRIVATE_KEY not set");
	}
	const privateKeyBytes = Uint8Array.from(JSON.parse(rawKey));
	const keypair = Keypair.fromSecretKey(privateKeyBytes);
	const wallet = new Wallet(keypair);

	const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());

	const migrationService = new MigrationService(connection, provider, redis, DB);

	(migrationService as any).keyPair = keypair;

	// Start the service
	await migrationService.initialize();

	console.log("Migration service started successfully");

	// Handle shutdown
	process.on("SIGINT", async () => {
		console.log("Shutting down migration service...");
		await migrationService.shutdown();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		console.log("Shutting down migration service...");
		await migrationService.shutdown();
		process.exit(0);
	});
}

main().catch((error) => {
	console.error("Error starting migration service:", error);
	process.exit(1);
});
