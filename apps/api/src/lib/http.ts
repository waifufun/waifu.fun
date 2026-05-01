import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppBindings } from "./bindings.js";

export function respondOk<T>(c: Context<AppBindings>, data: T, status: ContentfulStatusCode = 200) {
	return c.json(
		{
			ok: true as const,
			data,
			requestId: c.get("requestId"),
		},
		status,
	);
}

export function respondAccepted<T>(c: Context<AppBindings>, data: T) {
	return respondOk(c, data, 202);
}
