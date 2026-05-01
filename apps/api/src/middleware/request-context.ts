import { randomUUID } from "node:crypto";

import type { MiddlewareHandler } from "hono";
import type { Logger } from "pino";

import type { AppDependencies } from "../contracts/services.js";
import type { AppBindings } from "../lib/bindings.js";

export function attachRequestContext(deps: AppDependencies, logger: Logger): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		const requestId = c.req.header("x-request-id") ?? randomUUID();
		c.set("requestId", requestId);
		c.set("deps", deps);
		c.set("logger", logger.child({ requestId }));
		await next();
	};
}
