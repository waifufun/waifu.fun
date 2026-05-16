import type { MiddlewareHandler } from "hono";
import RedisModule from "ioredis";
import type { Redis, RedisOptions } from "ioredis";

import type { AppBindings } from "../lib/bindings.js";

export interface RateLimitOptions {
	bucket: string;
	limit?: number;
	windowMs?: number;
	store?: RateLimitStore;
	keyGenerator?: (
		c: Parameters<MiddlewareHandler<AppBindings>>[0],
	) => string | null | undefined | Promise<string | null | undefined>;
}

type BucketEntry = {
	count: number;
	resetAt: number;
};

export interface RateLimitStore {
	increment: (key: string, windowMs: number) => Promise<BucketEntry>;
	reset?: () => void | Promise<void>;
}

export type RedisRateLimitClient = Pick<Redis, "eval" | "disconnect">;

const DEFAULT_LIMITS: Record<string, { limit: number; windowMs: number }> = {
	admin: { limit: 60, windowMs: 60 * 1000 },
	auth: { limit: 60, windowMs: 60 * 1000 },
	"v3-agent": { limit: 30, windowMs: 60 * 1000 },
	webhook: { limit: 120, windowMs: 60 * 1000 },
	launch: { limit: 120, windowMs: 60 * 1000 },
	trade: { limit: 300, windowMs: 60 * 1000 },
};

const INCREMENT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
	redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

let defaultStore: RateLimitStore | undefined;
let defaultRedisClient: RedisRateLimitClient | undefined;
const RedisClient = RedisModule as unknown as new (url: string, options: RedisOptions) => Redis;

function defaultKey(c: Parameters<MiddlewareHandler<AppBindings>>[0]): string {
	return (
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
		c.req.header("cf-connecting-ip") ||
		c.req.header("x-real-ip") ||
		"unknown"
	);
}

function normalizeKeyPart(value: string): string {
	return value.replaceAll(/\s+/g, "_").replaceAll(/[^a-zA-Z0-9:._-]/g, "-");
}

export function createMemoryRateLimitStore(): RateLimitStore {
	const buckets = new Map<string, BucketEntry>();
	return {
		async increment(key, windowMs) {
			const now = Date.now();
			const existing = buckets.get(key);
			const entry = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
			entry.count += 1;
			buckets.set(key, entry);
			return entry;
		},
		reset() {
			buckets.clear();
		},
	};
}

export function createRedisRateLimitStore(
	client: RedisRateLimitClient = new RedisClient(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
		connectionName: "waifu:api:rate-limit",
		enableReadyCheck: false,
		lazyConnect: true,
		maxRetriesPerRequest: 1,
	}),
	prefix = "waifu:api:rate-limit",
): RateLimitStore {
	return {
		async increment(key, windowMs) {
			const now = Date.now();
			const redisKey = `${prefix}:${normalizeKeyPart(key)}`;
			const result = (await client.eval(INCREMENT_SCRIPT, 1, redisKey, String(windowMs))) as [
				number | string,
				number | string,
			];
			const count = Number(result[0]);
			const ttl = Number(result[1]);
			return {
				count,
				resetAt: now + (Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs),
			};
		},
	};
}

function shouldUseRedisByDefault(): boolean {
	const mode = process.env.RATE_LIMIT_STORE?.toLowerCase();
	if (mode === "memory") return false;
	if (mode === "redis") return true;
	return process.env.NODE_ENV === "production" || Boolean(process.env.REDIS_URL);
}

function getDefaultStore(): RateLimitStore {
	if (!defaultStore) {
		if (shouldUseRedisByDefault()) {
			defaultRedisClient = new RedisClient(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
				connectionName: "waifu:api:rate-limit",
				enableReadyCheck: false,
				lazyConnect: true,
				maxRetriesPerRequest: 1,
			});
			defaultStore = createRedisRateLimitStore(defaultRedisClient);
		} else {
			defaultStore = createMemoryRateLimitStore();
		}
	}
	return defaultStore;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		const defaults = DEFAULT_LIMITS[options.bucket];
		const limit = options.limit ?? defaults?.limit;
		const windowMs = options.windowMs ?? defaults?.windowMs;

		if (!limit || !windowMs) {
			c.header("X-RateLimit-Policy", `${options.bucket}; mode=compat-pass-through`);
			c.header("X-RateLimit-Limit", "unbounded");
			c.header("X-RateLimit-Remaining", "unbounded");
			c.header("X-RateLimit-Reset", "0");
			await next();
			return;
		}

		const now = Date.now();
		const key = (await options.keyGenerator?.(c)) ?? defaultKey(c);
		const bucketKey = `${options.bucket}:${key}`;
		const entry = await (options.store ?? getDefaultStore()).increment(bucketKey, windowMs);

		if (entry.count > limit) {
			const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
			c.header("X-RateLimit-Policy", `${options.bucket}; limit=${limit}; window=${windowMs}`);
			c.header("X-RateLimit-Limit", String(limit));
			c.header("X-RateLimit-Remaining", "0");
			c.header("X-RateLimit-Reset", String(resetSeconds));
			c.header("Retry-After", String(resetSeconds));
			return c.json({ ok: false, error: "RATE_LIMITED", message: "too many requests" }, 429);
		}

		c.header("X-RateLimit-Policy", `${options.bucket}; limit=${limit}; window=${windowMs}`);
		c.header("X-RateLimit-Limit", String(limit));
		c.header("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
		c.header("X-RateLimit-Reset", String(Math.max(0, Math.ceil((entry.resetAt - now) / 1000))));
		await next();
	};
}

export function __resetRateLimitBucketsForTest(): void {
	defaultRedisClient?.disconnect();
	defaultRedisClient = undefined;
	defaultStore = createMemoryRateLimitStore();
}
