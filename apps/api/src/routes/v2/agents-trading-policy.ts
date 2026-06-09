import { Hono } from "hono";
import type { Context } from "hono";

import type { RequireAgentOwnershipBindings } from "../../middleware/patron-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import { buildStewardClientForIdentity, resolveStewardIdentity } from "../../services/agent-launch/steward-identity.js";
import {
	type StewardClient,
	StewardError,
	type StewardPolicyCaps,
	type StewardPolicyRule,
} from "../../services/agent-launch/steward.js";

/**
 * Patron-facing trading-policy proxy.
 *
 * waifu-core is the gateway between the browser and Steward. The patron never
 * talks to Steward directly: every read/write here flows through
 * `requirePatron()` + `requireAgentOwnership()`, then this route forwards to
 * Steward holding the server-side tenant key + `X-Steward-Tenant` header. This
 * is the enforcement point for "only the human owner can change the agent's
 * money guardrails" — an agent token can NOT reach these routes (PR #94 moved
 * policy writes to tenant/owner auth).
 *
 * Routes (all relative to /v2/agents):
 *   GET  /:id/trading-policy    -> { policy: StewardPolicyCaps }
 *   PUT  /:id/trading-policy    -> { policy: StewardPolicyCaps }   body: caps
 *   GET  /:id/trading-policies  -> { policies: StewardPolicyRule[] }
 *   PUT  /:id/trading-policies  -> { policies: StewardPolicyRule[] } body: { policies }
 */

const app = new Hono<RequireAgentOwnershipBindings>();

type TradingPolicyDeps = {
	steward: StewardClient | undefined;
};

const deps: TradingPolicyDeps = { steward: undefined };

export function __setTradingPolicyStewardForTest(client: StewardClient | undefined): void {
	deps.steward = client;
}

/**
 * Resolve the Steward client + the agentId to address for THIS agent.
 *
 * Cloud agents (those with `agent_personas.steward_agent_id`) live under a
 * different Steward tenant (e.g. Sol = `sol-waifu` under `elizacloud`) that the
 * waifu tenant key cannot reach; for those we mint a cross-tenant HS256 bearer.
 * Everyone else uses the waifu slug + tenant key (unchanged behaviour).
 *
 * Returns the agentId to call Steward with alongside the client, so the route
 * never sends the raw waifu slug to the wrong tenant.
 */
async function getStewardForAgent(
	c: Context<RequireAgentOwnershipBindings>,
): Promise<{ client: StewardClient; stewardAgentId: string } | null> {
	const patronAgent = c.get("patronAgent");
	const identity = resolveStewardIdentity({
		waifuSlug: patronAgent.agentId,
		stewardAgentId: patronAgent.stewardAgentId,
	});
	// Test-injected client short-circuits, but we still resolve the right agentId.
	if (deps.steward) {
		return { client: deps.steward, stewardAgentId: identity.stewardAgentId };
	}
	const client = await buildStewardClientForIdentity(identity);
	if (!client) return null;
	return { client, stewardAgentId: identity.stewardAgentId };
}

/** Map a StewardError onto a clean JSON response without leaking tenant internals. */
function stewardErrorResponse(c: Context<RequireAgentOwnershipBindings>, err: unknown) {
	if (err instanceof StewardError) {
		// 404 from Steward = policy not initialised yet. Treat as empty, not fatal.
		const status = err.status >= 400 && err.status < 600 ? err.status : 502;
		return c.json(
			{ ok: false, error: "STEWARD_ERROR", message: err.message, upstreamStatus: err.status },
			status as 400,
		);
	}
	return c.json(
		{ ok: false, error: "STEWARD_UNREACHABLE", message: err instanceof Error ? err.message : String(err) },
		502,
	);
}

// ── caps: dailyCap / perOrderCap / leverageCap / allowedAssets / allowedVenues ──

app.get("/:id/trading-policy", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const resolved = await getStewardForAgent(c);
	if (!resolved) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);
	try {
		const policy = await resolved.client.getPolicy(resolved.stewardAgentId);
		return c.json({ ok: true, policy });
	} catch (err) {
		// A 404 means "no policy set yet" — return an empty caps object so the
		// editor renders defaults instead of an error.
		if (err instanceof StewardError && err.status === 404) {
			return c.json({ ok: true, policy: {} as StewardPolicyCaps });
		}
		return stewardErrorResponse(c, err);
	}
});

/** Result of the shared trading-policy update handler (status + JSON body). */
export type TradingPolicyHandlerResult = { status: number; body: unknown };

/**
 * Core trading-policy update handler, factored out of the PUT route closure so
 * BOTH the bespoke PUT /:id/trading-policy route AND the generic capability
 * action dispatcher can delegate to the SAME Steward-proxy logic. Body must be
 * an already-parsed caps object. This is a `server_job`-class action today
 * (forwards to Steward), so the generic dispatcher only reaches it once that
 * mode is enabled — the bespoke route stays the live path.
 */
export async function runTradingPolicyUpdate(
	c: Context<RequireAgentOwnershipBindings>,
	body: Record<string, unknown>,
): Promise<TradingPolicyHandlerResult> {
	const resolved = await getStewardForAgent(c);
	if (!resolved) return { status: 503, body: { ok: false, error: "STEWARD_NOT_CONFIGURED" } };

	const parsed = sanitizeCaps(body);
	if (!parsed.ok) {
		return { status: 400, body: { ok: false, error: "INVALID_CAP", message: parsed.message } };
	}
	try {
		const policy = await resolved.client.putPolicy(resolved.stewardAgentId, parsed.caps);
		return { status: 200, body: { ok: true, policy } };
	} catch (err) {
		const res = stewardErrorResponse(c, err);
		return { status: res.status, body: await res.json() };
	}
}

app.put("/:id/trading-policy", requirePatron(), requireAgentOwnership("id"), async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON" }, 400);
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return c.json({ ok: false, error: "INVALID_BODY", message: "caps object required" }, 400);
	}

	const result = await runTradingPolicyUpdate(c, body as Record<string, unknown>);
	return c.json(result.body as Record<string, unknown>, result.status as 200);
});

// ── rules: includes the approved-addresses withdraw whitelist ──

app.get("/:id/trading-policies", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const resolved = await getStewardForAgent(c);
	if (!resolved) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);
	try {
		const policies = await resolved.client.getPolicies(resolved.stewardAgentId);
		return c.json({ ok: true, policies });
	} catch (err) {
		if (err instanceof StewardError && err.status === 404) {
			return c.json({ ok: true, policies: [] as StewardPolicyRule[] });
		}
		return stewardErrorResponse(c, err);
	}
});

app.put("/:id/trading-policies", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const resolved = await getStewardForAgent(c);
	if (!resolved) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON" }, 400);
	}
	const rawRules = (body as { policies?: unknown })?.policies ?? body;
	if (!Array.isArray(rawRules)) {
		return c.json({ ok: false, error: "INVALID_BODY", message: "policies must be an array" }, 400);
	}

	const rules = sanitizeRules(rawRules);
	if (rules === null) {
		return c.json({ ok: false, error: "INVALID_RULE", message: "each rule needs a string `type`" }, 400);
	}

	try {
		const policies = await resolved.client.putPolicies(resolved.stewardAgentId, rules);
		return c.json({ ok: true, policies });
	} catch (err) {
		return stewardErrorResponse(c, err);
	}
});

// ── input sanitisation ──

function parseCap(
	input: Record<string, unknown>,
	key: "dailyCap" | "perOrderCap" | "leverageCap",
): { ok: true; value: number | null | undefined } | { ok: false; message: string } {
	const value = input[key];
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null) return { ok: true, value: null };
	if (typeof value !== "number" && typeof value !== "string") {
		return { ok: false, message: `${key} must be a non-negative number or null` };
	}
	const trimmed = typeof value === "string" ? value.trim() : value;
	if (trimmed === "") {
		return { ok: false, message: `${key} must be a non-negative number or null` };
	}
	const n = typeof trimmed === "number" ? trimmed : Number(trimmed);
	if (!Number.isFinite(n) || n < 0) {
		return { ok: false, message: `${key} must be a non-negative number or null` };
	}
	return { ok: true, value: n };
}

function toStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: string[] = [];
	for (const v of value) {
		if (typeof v === "string" && v.trim().length > 0) out.push(v.trim());
	}
	return out;
}

function sanitizeCaps(
	input: Record<string, unknown>,
): { ok: true; caps: StewardPolicyCaps } | { ok: false; message: string } {
	const caps: StewardPolicyCaps = {};
	const daily = parseCap(input, "dailyCap");
	if (!daily.ok) return daily;
	if (daily.value !== undefined) caps.dailyCap = daily.value;
	const perOrder = parseCap(input, "perOrderCap");
	if (!perOrder.ok) return perOrder;
	if (perOrder.value !== undefined) caps.perOrderCap = perOrder.value;
	const leverage = parseCap(input, "leverageCap");
	if (!leverage.ok) return leverage;
	if (leverage.value !== undefined) caps.leverageCap = leverage.value;
	const assets = toStringArray(input.allowedAssets);
	if (assets !== undefined) caps.allowedAssets = assets;
	const venues = toStringArray(input.allowedVenues);
	if (venues !== undefined) caps.allowedVenues = venues;
	return { ok: true, caps };
}

function sanitizeRules(input: unknown[]): StewardPolicyRule[] | null {
	const out: StewardPolicyRule[] = [];
	for (const raw of input) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
		const obj = raw as Record<string, unknown>;
		if (typeof obj.type !== "string" || obj.type.trim().length === 0) return null;
		const rule: StewardPolicyRule = { ...obj, type: obj.type.trim() };
		const addresses = toStringArray(obj.addresses);
		if (addresses !== undefined) rule.addresses = addresses;
		out.push(rule);
	}
	return out;
}

export default app;
