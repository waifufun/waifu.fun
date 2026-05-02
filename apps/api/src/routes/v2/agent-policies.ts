import { agentAdapterPolicies, agentPersonas, getDatabase } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context, Next } from "hono";

import { constantTimeEqual } from "../../lib/agent-keys.js";
import type { AppBindings } from "../../lib/bindings.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import type { RequireAgentOwnershipBindings } from "../../middleware/patron-auth.js";

const app = new Hono<AppBindings & RequireAgentOwnershipBindings>();

// GET remains admin-only for ops. PUT is patron-scoped below.
async function requireAdmin(c: Context<AppBindings>, next: Next) {
	const authHeader = c.req.header("authorization");
	if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Admin bearer token required" }, 401);
	}

	const expected = process.env.ADMIN_API_KEY;
	const got = authHeader.slice(7).trim();
	if (!expected || expected.length === 0 || !constantTimeEqual(got, expected)) {
		return c.json({ ok: false, error: "FORBIDDEN", message: "Invalid admin bearer token" }, 403);
	}

	await next();
}

type AdapterPolicyJson = {
	id: string;
	agent_id: string;
	adapter_slug: string;
	enabled: boolean;
	daily_value_cap_wei: string | null;
	per_tx_value_cap_wei: string | null;
	allowed_actions: string[];
	denied_actions: string[];
	updated_at: string;
};

type AdapterPolicyInput = Partial<
	Pick<
		AdapterPolicyJson,
		"adapter_slug" | "enabled" | "daily_value_cap_wei" | "per_tx_value_cap_wei" | "allowed_actions" | "denied_actions"
	>
>;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function serializePolicy(row: typeof agentAdapterPolicies.$inferSelect): AdapterPolicyJson {
	return {
		id: row.id,
		agent_id: row.agentId,
		adapter_slug: row.adapterSlug,
		enabled: row.enabled,
		daily_value_cap_wei: row.dailyValueCapWei,
		per_tx_value_cap_wei: row.perTxValueCapWei,
		allowed_actions: row.allowedActions,
		denied_actions: row.deniedActions,
		updated_at: row.updatedAt.toISOString(),
	};
}

async function requireAgent(db: ReturnType<typeof getDatabase>["db"], id: string) {
	const [agent] = await db
		.select({ id: agentPersonas.id })
		.from(agentPersonas)
		.where(eq(agentPersonas.id, id))
		.limit(1);
	return agent ?? null;
}

app.get("/:id/adapter-policies", requireAdmin, async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

	const agentId = c.req.param("id") ?? "";
	const agent = await requireAgent(db, agentId);
	if (!agent) return c.json({ ok: false, error: "AGENT_NOT_FOUND" }, 404);

	const policies = await db
		.select()
		.from(agentAdapterPolicies)
		.where(eq(agentAdapterPolicies.agentId, agentId))
		.orderBy(agentAdapterPolicies.adapterSlug);

	return c.json({ policies: policies.map(serializePolicy) });
});

app.put("/:id/adapter-policies", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

	const agentId = c.req.param("id") ?? "";
	const agent = await requireAgent(db, agentId);
	if (!agent) return c.json({ ok: false, error: "AGENT_NOT_FOUND" }, 404);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON" }, 400);
	}

	const policies = (body as { policies?: unknown })?.policies;
	if (!Array.isArray(policies)) {
		return c.json({ ok: false, error: "INVALID_BODY", message: "policies must be an array" }, 400);
	}

	const now = new Date();
	for (const raw of policies) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			return c.json({ ok: false, error: "INVALID_POLICY" }, 400);
		}
		const input = raw as AdapterPolicyInput;
		if (!input.adapter_slug || typeof input.adapter_slug !== "string") {
			return c.json({ ok: false, error: "INVALID_POLICY", message: "adapter_slug is required" }, 400);
		}
		const set = {
			agentId,
			adapterSlug: input.adapter_slug,
			enabled: input.enabled ?? true,
			dailyValueCapWei: input.daily_value_cap_wei ?? null,
			perTxValueCapWei: input.per_tx_value_cap_wei ?? null,
			allowedActions: input.allowed_actions ?? [],
			deniedActions: input.denied_actions ?? [],
			updatedAt: now,
		} satisfies typeof agentAdapterPolicies.$inferInsert;

		await db
			.insert(agentAdapterPolicies)
			.values(set)
			.onConflictDoUpdate({
				target: [agentAdapterPolicies.agentId, agentAdapterPolicies.adapterSlug],
				set: {
					enabled: set.enabled,
					dailyValueCapWei: set.dailyValueCapWei,
					perTxValueCapWei: set.perTxValueCapWei,
					allowedActions: set.allowedActions,
					deniedActions: set.deniedActions,
					updatedAt: sql`now()`,
				},
			});
	}

	const rows = await db
		.select()
		.from(agentAdapterPolicies)
		.where(eq(agentAdapterPolicies.agentId, agentId))
		.orderBy(agentAdapterPolicies.adapterSlug);

	return c.json({ policies: rows.map(serializePolicy) });
});

export default app;
