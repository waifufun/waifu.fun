import { Redis } from "ioredis";

import { getRedisUrl as getConfiguredRedisUrl, redisOptionsFromEnv } from "@waifufun/redis/config";

export type RedisConnection = InstanceType<typeof Redis>;

export interface RedisConnectionOptions {
	connectionName?: string;
	lazyConnect?: boolean;
}

export function getRedisUrl(): string {
	return getConfiguredRedisUrl(process.env);
}

export function createRedisConnection(options: RedisConnectionOptions = {}): RedisConnection {
	return new Redis(
		getRedisUrl(),
		redisOptionsFromEnv(process.env, {
			connectionName: options.connectionName,
			maxRetriesPerRequest: null,
			enableReadyCheck: false,
			lazyConnect: options.lazyConnect ?? false,
		}),
	);
}

// Shared producer/admin connection used by queue instances in this package.
// Long-lived consumers (BullMQ workers) should create their own dedicated connections.
export const redisConnection = createRedisConnection({
	connectionName: "waifu:queue:shared",
});

export async function closeRedisConnection(connection: RedisConnection = redisConnection): Promise<void> {
	if (connection.status === "end") {
		return;
	}

	try {
		await connection.quit();
	} catch {
		connection.disconnect();
	}
}
