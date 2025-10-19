import * as DB from "./models";
import logger from "@autofun/logger";
import dotenv from "dotenv";
import Mongoose from "mongoose";

dotenv.config();

Mongoose.set("strictQuery", false);
Mongoose.set("autoIndex", false);

logger.info("Attempting to connect to database..");

/** @dev Shutdown server if we are not able to connect to server */
if (!process.env.MONGO_URI) {
	logger.error("Missing MONGO_URI from ENV");
	process.exit(1);
}

/** @dev Connect to MongoDB */
Mongoose.connect(process.env.MONGO_URI, {
	socketTimeoutMS: 45_000,
	serverSelectionTimeoutMS: 15_000,
	connectTimeoutMS: 15_000,
	autoIndex: false,
	// Removed directConnection: true to allow proper replica set discovery
	// This ensures we connect to the primary node for write operations
}).catch((e) => {
	logger.info(`Unable to connect to database => ${e.message}`);
});

/** @dev MongoDB Event Listeners */
Mongoose.connection.on("error", (err) => {
	logger.error(`Database error => ${err.message}`);
});

Mongoose.connection.on("open", () => {
	logger.info("Database open");
});

Mongoose.connection.on("connected", async () => {
	logger.info("Database connected");
	
	if (process.env.NODE_ENV !== "production") {
		// Wait a bit for replica set to elect primary
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		logger.info("Creating database indexes (development mode)...");
		
		// Retry logic for index creation in case replica set is still initializing
		let retries = 3;
		while (retries > 0) {
			try {
				await Promise.all(
					Object.values(Mongoose.connection.models).map(model => model.syncIndexes())
				);
				logger.info("Database indexes created successfully");
				break;
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				
				if (errorMsg.includes("not primary") && retries > 1) {
					retries--;
					logger.warn(`Replica set not ready, retrying index creation (${retries} attempts left)...`);
					await new Promise(resolve => setTimeout(resolve, 3000));
				} else {
					logger.error(`Failed to create indexes: ${errorMsg}`);
					break;
				}
			}
		}
	}
});

Mongoose.connection.on("reconnected", () => {
	logger.info("Database reconnected");
});

Mongoose.connection.on("disconnecting", () => {
	logger.error("Database disconnecting");
});

Mongoose.connection.on("disconnected", () => {
	logger.error("Database disconnected");
});

export default DB;
