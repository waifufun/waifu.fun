import { Command } from "commander";
import { DataSync } from "./sync.js";
import logger from "@autofun/logger";
import dotenv from "dotenv";
import path from "path";

const rootDir = path.resolve(process.cwd(), '../../');
console.log(`Root directory: ${rootDir}`);
const envPath = path.resolve(rootDir, '.env');
logger.info(`Loading environment from: ${envPath}`);

const result = dotenv.config({ path: envPath });


if (result.error) {
  logger.error('Error loading .env file:', result.error);
  process.exit(1);
}

logger.info("Environment variables loaded:");
logger.info("MONGO_URI:", process.env.MONGO_URI ? "Set" : "Not set");
logger.info("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not set");

const program = new Command();

program
  .name("sync")
  .description("Sync data from PostgreSQL to MongoDB")
  .version("1.0.0");

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

      logger.info("Starting sync with connection string:", pgConnectionString.substring(0, 20) + "...");
      
      const sync = new DataSync(pgConnectionString);
      logger.info("DataSync instance created");
      
      await sync.syncTokens(parseInt(options.batchSize));
      logger.info("Sync completed");
      
      await sync.close();
      logger.info("Connection closed");
      
      logger.info("Token sync completed successfully");
    } catch (error) {
      console.error("Error during sync:", error);
      if (error instanceof Error) {
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      process.exit(1);
    }
  });

program.parse(); 