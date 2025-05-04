import * as DB from "./models";
import logger from "@autofun/logger";
import dotenv from "dotenv";
import Mongoose from "mongoose";

dotenv.config({
  path: "../../.env",
});

Mongoose.set("strictQuery", false);

logger.info("Attempting to connect to database..");

/** @dev Shutdown server if we are not able to connect to server */
if (!process.env.MONGO_URI) {
  logger.error("Missing MONGO_URI from ENV");
  process.exit(1);
}

/** @dev Connect to MongoDB */
Mongoose.connect(process.env.MONGO_URI, {
  socketTimeoutMS: 15_000,
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
