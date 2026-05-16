import logger from "@waifufun/logger";
import dotenv from "dotenv";
import Mongoose from "mongoose";
import * as DB from "./models/index.js";

dotenv.config();

Mongoose.set("strictQuery", false);

logger.info("Attempting to connect to database..");

/** @dev Connect to MongoDB */
if (process.env.MONGO_URI && process.env.NODE_ENV !== "test" && process.env.DATABASE_AUTO_CONNECT !== "false") {
	Mongoose.connect(process.env.MONGO_URI, {
		socketTimeoutMS: 15_000,
	}).catch((e) => {
		logger.info(`Unable to connect to database => ${e.message}`);
	});
} else if (process.env.MONGO_URI) {
	logger.warn("Skipping database connection because automatic connection is disabled.");
} else {
	logger.warn("Skipping database connection because MONGO_URI is not set.");
}

/** @dev MongoDB Event Listeners */
Mongoose.connection.on("error", (err) => {
	logger.error(`Database error => ${err.message}`);
});

Mongoose.connection.on("open", () => {
	logger.info("Database open");
});

Mongoose.connection.on("connected", () => {
	logger.info("Database connected");
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
