import { Hono } from "hono";
import type { Context } from "hono";

import type { RequireAgentOwnershipBindings } from "../../middleware/patron-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import {
	type StewardClient,
	StewardError,
	type StewardPolicyCaps,
	type StewardPolicyRule,
	createStewardClient,
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

function getSteward(): StewardClient | null {
	if (deps.steward) return deps.steward;
	const baseUrl = process.env.STEWARD_API_URL;
	const apiKey = process.env.STEWARD_API_KEY;
	const tenantId = process.env.STEWARD_TENANT_ID ?? "waifu";
	if (!baseUrl || !apiKey) return null;
	return createStewardClient({ baseUrl, apiKey, tenantId });
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
	const steward = getSteward();
	if (!steward) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);
	const agentSlug = c.get("patronAgent").agentId;
	try {
		const policy = await steward.getPolicy(agentSlug);
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

app.put("/:id/trading-policy", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const steward = getSteward();
	if (!steward) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);
	const agentSlug = c.get("patronAgent").agentId;

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON" }, 400);
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return c.json({ ok: false, error: "INVALID_BODY", message: "caps object required" }, 400);
	}

	const caps = sanitizeCaps(body as Record<string, unknown>);
	try {
		const policy = await steward.putPolicy(agentSlug, caps);
		return c.json({ ok: true, policy });
	} catch (err) {
		return stewardErrorResponse(c, err);
	}
});

// ── rules: includes the approved-addresses withdraw whitelist ──

app.get("/:id/trading-policies", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const steward = getSteward();
	if (!steward) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);
	const agentSlug = c.get("patronAgent").agentId;
	try {
		const policies = await steward.getPolicies(agentSlug);
		return c.json({ ok: true, policies });
	} catch (err) {
		if (err instanceof StewardError && err.status === 404) {
			return c.json({ ok: true, policies: [] as StewardPolicyRule[] });
		}
		return stewardErrorResponse(c, err);
	}
});

app.put("/:id/trading-policies", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const steward = getSteward();
	if (!steward) return c.json({ ok: false, error: "STEWARD_NOT_CONFIGURED" }, 503);
	const agentSlug = c.get("patronAgent").agentId;

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
		const policies = await steward.putPolicies(agentSlug, rules);
		return c.json({ ok: true, policies });
	} catch (err) {
		return stewardErrorResponse(c, err);
	}
});

// ── input sanitisation ──

function toFiniteNumberOrNull(value: unknown): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n) || n < 0) return undefined;
	return n;
}

function toStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: string[] = [];
	for (const v of value) {
		if (typeof v === "string" && v.trim().length > 0) out.push(v.trim());
	}
	return out;
}

function sanitizeCaps(input: Record<string, unknown>): StewardPolicyCaps {
	const caps: StewardPolicyCaps = {};
	const daily = toFiniteNumberOrNull(input.dailyCap);
	if (daily !== undefined) caps.dailyCap = daily;
	const perOrder = toFiniteNumberOrNull(input.perOrderCap);
	if (perOrder !== undefined) caps.perOrderCap = perOrder;
	const leverage = toFiniteNumberOrNull(input.leverageCap);
	if (leverage !== undefined) caps.leverageCap = leverage;
	const assets = toStringArray(input.allowedAssets);
	if (assets !== undefined) caps.allowedAssets = assets;
	const venues = toStringArray(input.allowedVenues);
	if (venues !== undefined) caps.allowedVenues = venues;
	return caps;
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
