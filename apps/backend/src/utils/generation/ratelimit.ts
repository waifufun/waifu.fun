import redis from "@waifufun/redis";

const RATE_LIMIT_KEY_PREFIX = "generation:rate:";
const MAX_GENERATIONS_PER_DAY = 10;
const RATE_LIMIT_WINDOW = 5 * 60;

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetTime: string;
}

export async function checkRateLimit(userPublicKey: string): Promise<RateLimitResult> {
	if (process.env.NODE_ENV === "development") {
		return {
			allowed: true,
			remaining: MAX_GENERATIONS_PER_DAY,
			resetTime: new Date(Date.now() + RATE_LIMIT_WINDOW * 1000).toISOString(),
		};
	}

	const key = `${RATE_LIMIT_KEY_PREFIX}${userPublicKey}`;

	const count = await redis.get(key);
	const currentCount = count ? Number.parseInt(count) : 0;

	const ttl = await redis.ttl(key);
	if (ttl === -1) {
		await redis.set(key, "0", "EX", RATE_LIMIT_WINDOW);
	}

	const remaining = Math.max(0, MAX_GENERATIONS_PER_DAY - currentCount);

	const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : RATE_LIMIT_WINDOW) * 1000).toISOString();

	return {
		allowed: currentCount < MAX_GENERATIONS_PER_DAY,
		remaining,
		resetTime,
	};
}

export async function incrementRateLimit(userPublicKey: string): Promise<void> {
	if (process.env.NODE_ENV === "development") {
		return;
	}

	const key = `${RATE_LIMIT_KEY_PREFIX}${userPublicKey}`;
	await redis.incr(key);

	const ttl = await redis.ttl(key);
	if (ttl === -1) {
		await redis.expire(key, RATE_LIMIT_WINDOW);
	}
}
