/**
 * Generic capability action dispatch.
 *
 * POST /v2/agents/:id/capabilities/:capabilitySlug/actions/:actionSlug
 *
 * One endpoint to invoke ANY capability action, instead of a hand-written route
 * per action. The flow is:
 *
 *   1. Resolve the agent (slug / uuid / token) via the shared resolver, build
 *      its capability descriptors (the same set GET .../capabilities returns),
 *      and look up the (capabilitySlug, actionSlug) descriptor. Unknown → 404.
 *   2. Validate the request body against the action's `inputs[]` schema (zod).
 *      Bad input → 400.
 *   3. Branch on the action's `mode`:
 *        - read          → call the underlying data/quote provider, return data.
 *        - prepare_tx /
 *          client_signed → return an UNSIGNED tx object { to, data, value } for
 *                          the patron's OWN wallet to sign (server never signs).
 *        - agent_signed /
 *          server_job    → 501 "not yet available" (depends on in-flight work).
 *      If the action `requiresConsent` and the request carries no consent flag,
 *      return 403 BEFORE attempting any of the above.
 *
 * Design: the server holds NO wallet key for user funds. Write-type actions
 * return an unsigned tx the user signs in their own wallet (exactly the existing
 * Hyperliquid deposit flow). The agent-signed path is intentionally disabled.
 *
 * Adding a new action is: declare it in the descriptor (descriptors.ts) + add a
 * handler to the registry below. No new route. `hyperliquid-perps` is the worked
 * example; its handlers DELEGATE to the existing bespoke route handlers so the
 * generic endpoint returns the SAME unsigned tx object as the live route.
 *
 * Depends on the capability registry (PR #1011, fix/capability-endpoint-verify)
 * for the descriptor builders + types.
 */

import {
	type AgentDescriptorContext,
	type CapabilityActionDescriptor,
	type CapabilityActionField,
	type CapabilityDescriptor,
	capabilityFromAdapterSpec,
	hyperliquidPerpsDescriptor,
	pancakeV3Spec,
	polymarketDescriptor,
	taxArbVaultDescriptor,
	venusSpec,
} from "@waifufun/agent-actions";
import { agentWalletRegistry, getDatabase } from "@waifufun/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import type { RequireAgentOwnershipBindings } from "../../../middleware/patron-auth.js";
import { requireAgentOwnership, requirePatron, resolveAgentByIdentifier } from "../../../middleware/patron-auth.js";
import { runHyperliquidDepositQuote } from "../agents-trading-deposit.js";
import { runTradingPolicyUpdate } from "../agents-trading-policy.js";

const app = new Hono<RequireAgentOwnershipBindings>();

type Db = ReturnType<typeof getDatabase>["db"];

/** Injectable deps for tests (matches the codebase __set*DepsForTest convention). */
let testDb: Db | undefined;
export function __setCapabilityActionRouteDepsForTest(deps: { db?: Db | undefined }): void {
	testDb = deps.db;
}

function requireDb(): Db | null {
	if (testDb) return testDb;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

// ─── descriptor resolution (mirrors the read route) ────────────────

interface ResolvedAgent {
	id: string;
	tokenAddress: string | null;
	stewardAgentId: string | null;
}

async function resolveAgent(db: NonNullable<Db>, idOrToken: string): Promise<ResolvedAgent | null> {
	const persona = await resolveAgentByIdentifier(db, idOrToken);
	if (persona) {
		return {
			id: persona.agentId,
			tokenAddress: persona.tokenAddress ?? null,
			stewardAgentId: persona.stewardAgentId ?? null,
		};
	}
	if (idOrToken.startsWith("0x")) {
		return { id: idOrToken.toLowerCase(), tokenAddress: idOrToken.toLowerCase(), stewardAgentId: null };
	}
	return null;
}

async function resolveHyperliquidWallet(db: NonNullable<Db>, tokenAddress: string | null): Promise<string | null> {
	if (!tokenAddress) return null;
	const [wallet] = await db
		.select({ address: agentWalletRegistry.address })
		.from(agentWalletRegistry)
		.where(and(eq(agentWalletRegistry.agentTokenAddress, tokenAddress), eq(agentWalletRegistry.venue, "hyperliquid")))
		.limit(1);
	return wallet?.address ?? null;
}

/** Build the same capability set the read route exposes. */
function buildCapabilities(ctx: AgentDescriptorContext): CapabilityDescriptor[] {
	return [
		hyperliquidPerpsDescriptor(ctx),
		capabilityFromAdapterSpec(pancakeV3Spec),
		capabilityFromAdapterSpec(venusSpec),
		polymarketDescriptor(ctx),
		taxArbVaultDescriptor(ctx),
	];
}

// ─── input schema (inputs[] → zod) ─────────────────────────────────

/**
 * Build a zod object schema from an action's `inputs[]` descriptor. The field
 * `type` vocabulary maps onto coarse runtime checks; required vs optional is
 * honoured. Numeric field types accept number OR numeric string (the form
 * surface posts strings) and coerce. Unknown extra keys are stripped, so a
 * caller can't smuggle params the descriptor never declared.
 */
function schemaForInputs(inputs: CapabilityActionField[]): z.ZodTypeAny {
	const shape: Record<string, z.ZodTypeAny> = {};
	for (const field of inputs) {
		let base: z.ZodTypeAny;
		switch (field.type) {
			case "number":
			case "amount":
				// number OR non-empty numeric string (form posts strings).
				base = z.union([z.number(), z.string().regex(/^[0-9]+(\.[0-9]+)?$/, "must be numeric")]);
				break;
			case "boolean":
				base = z.boolean();
				break;
			case "select":
				if (field.options && field.options.length > 0) {
					const values = field.options.map((o) => o.value) as [string, ...string[]];
					base = z.enum(values);
				} else {
					base = z.string();
				}
				break;
			case "address":
				base = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address");
				break;
			case "chain-select":
				// chain ids are numeric; the form surface may post a number or a numeric string.
				base = z.union([z.number().int(), z.string().regex(/^[0-9]+$/, "must be a numeric chain id")]);
				break;
			case "token-select":
				// token identifier (address or symbol) → string.
				base = z.string().min(1);
				break;
			default:
				// text / unknown → string
				base = z.string();
				break;
		}
		shape[field.name] = field.required ? base : base.optional();
	}
	return z.object(shape).strip();
}

// ─── handler registry ──────────────────────────────────────────────

/**
 * A handler runs an already-validated action for an authenticated, owning
 * patron and returns a status + JSON body. The READ + PREPARE_TX/CLIENT_SIGNED
 * branches are handled generically by the route from the descriptor; handlers
 * exist for the actions whose execution semantics are bespoke (Hyperliquid).
 */
type ActionHandlerResult = { status: number; body: unknown };
type ActionHandler = (
	c: Context<RequireAgentOwnershipBindings>,
	args: { input: Record<string, unknown>; descriptor: CapabilityActionDescriptor; agent: ResolvedAgent },
) => Promise<ActionHandlerResult>;

const NOT_YET_AVAILABLE: ActionHandler = async () => ({
	status: 501,
	body: { ok: false, error: "NOT_IMPLEMENTED", message: "not yet available" },
});

/**
 * Handler registry keyed by `${capabilitySlug}:${actionSlug}`. Adding a future
 * action = declare it in the descriptor + register a handler here. Hyperliquid
 * is the worked example; both handlers DELEGATE to the existing bespoke route
 * handler functions so behaviour is identical to the live routes.
 */
const HANDLERS: Record<string, ActionHandler> = {
	// Hyperliquid deposit — client_signed. Delegates to the same handler the live
	// POST /:id/trading/deposit-quote route uses, returning the SAME unsigned tx.
	"hyperliquid-perps:deposit": async (c, { input }) => runHyperliquidDepositQuote(c, input),

	// Hyperliquid trading-policy update — server_job. Delegates to the same Steward
	// proxy the live PUT /:id/trading-policy route uses. Reached only once the
	// server_job mode is enabled (today the route returns 501 before this).
	"hyperliquid-perps:set-policy": async (c, { input }) => runTradingPolicyUpdate(c, input),

	// Planned capabilities — descriptor-only, no execution backend yet.
	"polymarket:place-order": NOT_YET_AVAILABLE,
	"tax-arb-vault:harvest-tax": NOT_YET_AVAILABLE,
};

function handlerKey(capabilitySlug: string, actionSlug: string): string {
	return `${capabilitySlug}:${actionSlug}`;
}

// ─── consent ───────────────────────────────────────────────────────

/**
 * A consent-gated action requires an explicit consent flag in the request. We
 * accept a top-level `consent: true` (or `consent: "..."` non-empty) so the UI
 * can attach the human's confirmation. Absent/false → caller has not consented.
 */
function hasConsent(body: Record<string, unknown>): boolean {
	const v = body.consent;
	if (v === true) return true;
	if (typeof v === "string" && v.trim().length > 0) return true;
	return false;
}

// ─── route ─────────────────────────────────────────────────────────

app.post(
	"/:id/capabilities/:capabilitySlug/actions/:actionSlug",
	requirePatron(),
	requireAgentOwnership("id"),
	async (c) => {
		const db = requireDb();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

		const idParam = c.req.param("id");
		const capabilitySlug = c.req.param("capabilitySlug");
		const actionSlug = c.req.param("actionSlug");

		const resolved = await resolveAgent(db, idParam);
		if (!resolved) return c.json({ ok: false, error: "NOT_FOUND", message: "agent not found" }, 404);

		const hyperliquidWallet = await resolveHyperliquidWallet(db, resolved.tokenAddress);
		const ctx: AgentDescriptorContext = {
			id: resolved.id,
			tokenAddress: resolved.tokenAddress,
			hyperliquidWallet,
			stewardAgentId: resolved.stewardAgentId,
		};

		const capabilities = buildCapabilities(ctx);
		const capability = capabilities.find((cap) => cap.slug === capabilitySlug);
		if (!capability) {
			return c.json(
				{ ok: false, error: "CAPABILITY_NOT_FOUND", message: `unknown capability '${capabilitySlug}'` },
				404,
			);
		}
		const action = capability.actions.find((a) => a.slug === actionSlug);
		if (!action) {
			return c.json(
				{ ok: false, error: "ACTION_NOT_FOUND", message: `unknown action '${actionSlug}' on '${capabilitySlug}'` },
				404,
			);
		}

		// Parse body (default to {} for empty bodies / no-input actions).
		let rawBody: unknown;
		try {
			const text = await c.req.text();
			rawBody = text.trim().length === 0 ? {} : JSON.parse(text);
		} catch {
			return c.json({ ok: false, error: "INVALID_JSON", message: "body must be JSON" }, 400);
		}
		if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
			return c.json({ ok: false, error: "INVALID_BODY", message: "body object required" }, 400);
		}
		const body = rawBody as Record<string, unknown>;

		// Validate inputs against the descriptor's schema.
		const parsed = schemaForInputs(action.inputs).safeParse(body);
		if (!parsed.success) {
			return c.json(
				{
					ok: false,
					error: "INVALID_INPUT",
					message: "request body failed action input validation",
					issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
				},
				400,
			);
		}
		const input = parsed.data as Record<string, unknown>;

		// Consent gate: a consent-required action with no consent flag → 403.
		if (action.requiresConsent && !hasConsent(body)) {
			return c.json({ ok: false, error: "CONSENT_REQUIRED", message: "this action requires explicit consent" }, 403);
		}

		// Mode branch.
		switch (action.mode) {
			case "agent_signed":
			case "server_job":
				// Not enabled yet — depends on in-flight agent-signer/worker work.
				return c.json({ ok: false, error: "NOT_IMPLEMENTED", message: "not yet available" }, 501);

			case "read":
			case "prepare_tx":
			case "client_signed": {
				const handler = HANDLERS[handlerKey(capabilitySlug, actionSlug)];
				if (!handler) {
					// Declared in a descriptor but no backend wired — treat as not ready.
					return c.json({ ok: false, error: "NOT_IMPLEMENTED", message: "not yet available" }, 501);
				}
				const result = await handler(c, { input, descriptor: action, agent: resolved });
				return c.json(result.body as Record<string, unknown>, result.status as 200);
			}

			default:
				return c.json({ ok: false, error: "UNSUPPORTED_MODE", message: `unsupported mode '${action.mode}'` }, 400);
		}
	},
);

export default app;
