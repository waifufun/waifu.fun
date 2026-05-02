import { Redis } from "ioredis";

const defaultRedisUrl = "redis://127.0.0.1:6379";

export type RedisConnection = InstanceType<typeof Redis>;

export interface RedisConnectionOptions {
	connectionName?: string;
	lazyConnect?: boolean;
}

export function getRedisUrl(): string {
	return process.env.REDIS_URL ?? defaultRedisUrl;
}

export function createRedisConnection(options: RedisConnectionOptions = {}): RedisConnection {
	return new Redis(getRedisUrl(), {
		connectionName: options.connectionName,
		maxRetriesPerRequest: null,
		enableReadyCheck: false,
		lazyConnect: options.lazyConnect ?? false,
	});
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
