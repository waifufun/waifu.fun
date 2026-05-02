import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../lib/bindings.js";

export interface RateLimitOptions {
	bucket: string;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		c.header("X-RateLimit-Policy", `${options.bucket}; mode=compat-pass-through`);
		c.header("X-RateLimit-Limit", "unbounded");
		c.header("X-RateLimit-Remaining", "unbounded");
		c.header("X-RateLimit-Reset", "0");
		await next();
	};
}
