import type { Context } from "hono";
import type { z } from "zod";

import type { AppBindings } from "./bindings.js";
import { invalidJson, validationFailed } from "./errors.js";

/**
 * RFC-4122 UUID shape check.
 *
 * Several agent routes accept a `:id` that may be EITHER a persona UUID
 * (`agent_personas.id`) OR a stable slug (`agent_personas.agent_id`) OR even a
 * token address. Querying the `uuid` column with a non-UUID string makes
 * Postgres throw `invalid input syntax for type uuid`, which bubbles up as an
 * unhandled 500. Guard the UUID lookup with this before hitting the DB.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && UUID_RE.test(value);
}

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
