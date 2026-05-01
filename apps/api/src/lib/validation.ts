import type { Context } from "hono";
import type { z } from "zod";

import type { AppBindings } from "./bindings.js";
import { invalidJson, validationFailed } from "./errors.js";

export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
	c: Context<AppBindings>,
	schema: TSchema,
): Promise<z.infer<TSchema>> {
	let body: unknown;

	try {
		body = await c.req.json();
	} catch (error) {
		throw invalidJson({
			reason: error instanceof Error ? error.message : "Unknown JSON parse error",
		});
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		throw validationFailed(result.error);
	}

	return result.data;
}

export function parseQuery<TSchema extends z.ZodTypeAny>(c: Context<AppBindings>, schema: TSchema): z.infer<TSchema> {
	const url = new URL(c.req.url);
	const raw: Record<string, string> = {};

	for (const [key, value] of url.searchParams.entries()) {
		raw[key] = value;
	}

	const result = schema.safeParse(raw);
	if (!result.success) {
		throw validationFailed(result.error);
	}

	return result.data;
}
