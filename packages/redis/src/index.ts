import dotenv from "dotenv";
import logger from "@autofun/logger";
import IORedis from "ioredis";

dotenv.config({
	path: "../../.env",
});

const port = process.env.REDIS_PORT;
const host = process.env.REDIS_HOST;
const username = process.env.REDIS_USERNAME;
const password = process.env.REDIS_PASSWORD;
const db = process.env.REDIS_DB;

if (process.env.NODE_ENV === "production") {
	if (!port || !host || !username || !password) {
		logger.error("Missing REDIS_* environment variables");
		process.exit(1);
	}
}

const redis = new IORedis(
	process.env.NODE_ENV === "production"
		? {
				port: Number(port),
				host: String(host),
				username: String(username),
				password: String(password),
				db: db ? Number(db) : 0,
			}
		: {},
);

redis.on("connecting", () => {
	logger.info("Connecting to Redis");
});

redis.on("ready", () => {
	logger.info("Connected to Redis");
});

redis.on("error", (e: Error) => {
	logger.info(`Error from Redis: ${e.message}`);
});

redis.on("reconnecting", () => {
	logger.warn("Reconnecting to Redis");
});

export default redis;
