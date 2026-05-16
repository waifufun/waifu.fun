import logger from "@waifufun/logger";
import dotenv from "dotenv";
import IORedis, { type RedisOptions } from "ioredis";

dotenv.config();

const url = process.env.REDIS_URL;
const port = process.env.REDIS_PORT;
const host = process.env.REDIS_HOST;
const username = process.env.REDIS_USERNAME;
const password = process.env.REDIS_PASSWORD;
const db = process.env.REDIS_DB;

if (process.env.NODE_ENV === "production") {
	if (!url && (!port || !host || !password)) {
		logger.error("Missing REDIS_* environment variables");
		process.exit(1);
	}
}

const redis = url ? new IORedis(url, redisAuthOptions()) : new IORedis(redisHostOptions());

redis.on("connecting", () => {
	logger.info("Connecting to Redis");
});

redis.on("ready", () => {
	logger.info("Connected to Redis");
});

redis.on("error", (e: Error) => {
	logger.error(`Error from Redis: ${redactRedisErrorMessage(e.message)}`);
});

redis.on("reconnecting", () => {
	logger.warn("Reconnecting to Redis");
});

export default redis;

function redisAuthOptions(): RedisOptions {
	return {
		...(username ? { username } : {}),
		...(password ? { password } : {}),
		...(db ? { db: Number(db) } : {}),
	};
}

function redisHostOptions(): RedisOptions {
	if (!host && process.env.NODE_ENV !== "production") return {};
	return {
		port: port ? Number(port) : 6379,
		host: host ?? "127.0.0.1",
		...(username ? { username } : {}),
		...(password ? { password } : {}),
		db: db ? Number(db) : 0,
	};
}

function redactRedisErrorMessage(message: string): string {
	let redacted = message;
	for (const secret of [password, redisPasswordFromUrl(url)]) {
		if (secret) redacted = redacted.split(secret).join("[REDACTED]");
	}
	return redacted;
}

function redisPasswordFromUrl(rawUrl: string | undefined): string | null {
	if (!rawUrl) return null;
	try {
		return new URL(rawUrl).password || null;
	} catch {
		return null;
	}
}
