import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../lib/bindings.js";

export interface RateLimitOptions {
	bucket: string;
	limit?: number;
	windowMs?: number;
	keyGenerator?: (
		c: Parameters<MiddlewareHandler<AppBindings>>[0],
	) => string | null | undefined | Promise<string | null | undefined>;
}

type BucketEntry = {
	count: number;
	resetAt: number;
};

const buckets = new Map<string, BucketEntry>();

const DEFAULT_LIMITS: Record<string, { limit: number; windowMs: number }> = {
	admin: { limit: 60, windowMs: 60 * 1000 },
	auth: { limit: 60, windowMs: 60 * 1000 },
	"v3-agent": { limit: 30, windowMs: 60 * 1000 },
	webhook: { limit: 120, windowMs: 60 * 1000 },
	launch: { limit: 120, windowMs: 60 * 1000 },
	trade: { limit: 300, windowMs: 60 * 1000 },
};

function defaultKey(c: Parameters<MiddlewareHandler<AppBindings>>[0]): string {
	return (
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
		c.req.header("cf-connecting-ip") ||
		c.req.header("x-real-ip") ||
		"unknown"
	);
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
		const existing = buckets.get(bucketKey);
		const entry = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

		if (entry.count >= limit) {
			const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
			c.header("X-RateLimit-Policy", `${options.bucket}; limit=${limit}; window=${windowMs}`);
			c.header("X-RateLimit-Limit", String(limit));
			c.header("X-RateLimit-Remaining", "0");
			c.header("X-RateLimit-Reset", String(resetSeconds));
			c.header("Retry-After", String(resetSeconds));
			return c.json({ ok: false, error: "RATE_LIMITED", message: "too many requests" }, 429);
		}

		entry.count += 1;
		buckets.set(bucketKey, entry);

		c.header("X-RateLimit-Policy", `${options.bucket}; limit=${limit}; window=${windowMs}`);
		c.header("X-RateLimit-Limit", String(limit));
		c.header("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
		c.header("X-RateLimit-Reset", String(Math.max(0, Math.ceil((entry.resetAt - now) / 1000))));
		await next();
	};
}

export function __resetRateLimitBucketsForTest(): void {
	buckets.clear();
}
