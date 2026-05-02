import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import type { AppBindings } from "../lib/bindings.js";
import { ApiError, validationFailed } from "../lib/errors.js";

function toErrorPayload(err: ApiError | Error, requestId: string) {
	if (err instanceof ApiError) {
		return {
			body: {
				ok: false as const,
				error: {
					code: err.code,
					message: err.message,
					details: err.details,
				},
				requestId,
			},
			status: err.status as ContentfulStatusCode,
		};
	}

	return {
		body: {
			ok: false as const,
			error: {
				code: "INTERNAL_SERVER_ERROR",
				message: "Unexpected API error",
			},
			requestId,
		},
		status: 500 as ContentfulStatusCode,
	};
}

export function apiErrorHandler(error: Error, c: Context<AppBindings>) {
	const requestId = c.get("requestId");
	const normalized = error instanceof ZodError ? validationFailed(error) : error;

	if (!(normalized instanceof ApiError)) {
		c.get("logger").error({ requestId, message: normalized.message, stack: normalized.stack }, "api error");
	}

	const payload = toErrorPayload(normalized, requestId);
	return c.json(payload.body, payload.status);
}

export function notFoundHandler(c: Context<AppBindings>) {
	return c.json(
		{
			ok: false,
			error: {
				code: "NOT_FOUND",
				message: "Route not found",
			},
			requestId: c.get("requestId"),
		},
		404,
	);
}
