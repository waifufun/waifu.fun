import { createHash, randomBytes } from "node:crypto";

import { type AgentPersonaRow, agentPersonas, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../lib/bindings.js";

export type AgentPullAuthBindings = AppBindings & {
	Variables: AppBindings["Variables"] & {
		agentPersona: AgentPersonaRow;
	};
};

export interface AgentPullAuthDeps {
	db?: ReturnType<typeof getDatabase>["db"];
	now?: () => Date;
}

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export function generateRuntimeApiKey(): string {
	return `wap_${randomBytes(32).toString("base64url")}`;
}

export function hashRuntimeApiKey(rawKey: string): string {
	return createHash("sha256").update(rawKey).digest("hex");
}

export function extractBearerToken(authHeader: string | undefined): string | null {
	if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
	const token = authHeader.slice(7).trim();
	return token.length > 0 ? token : null;
}

export function createAgentPullAuth(deps: AgentPullAuthDeps = {}): MiddlewareHandler<AgentPullAuthBindings> {
	return async (c, next) => {
		const rawKey = extractBearerToken(c.req.header("authorization"));
		if (!rawKey) {
			return c.json(
				{
					ok: false,
					error: "AGENT_PULL_AUTH_MISSING",
					message: "Authorization: Bearer <agent-api-key> required",
				},
				401,
			);
		}

		const db = deps.db ?? requireDb();
		if (!db) {
			return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "Database not configured" }, 503);
		}

		const hash = hashRuntimeApiKey(rawKey);
		const [persona] = await db.select().from(agentPersonas).where(eq(agentPersonas.runtimeApiKeyHash, hash)).limit(1);

		if (!persona) {
			return c.json({ ok: false, error: "AGENT_PULL_AUTH_INVALID", message: "Invalid agent runtime API key" }, 403);
		}

		const seenAt = deps.now?.() ?? new Date();
		db.update(agentPersonas)
			.set({ runtimeLastSeenAt: seenAt, updatedAt: seenAt })
			.where(eq(agentPersonas.id, persona.id))
			.catch(() => {
				/* last-seen is best-effort */
			});

		c.set("agentPersona", { ...persona, runtimeLastSeenAt: seenAt });
		await next();
	};
}

export const agentPullAuth = createAgentPullAuth;
