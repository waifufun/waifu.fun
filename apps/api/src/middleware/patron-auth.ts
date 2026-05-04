// Canonical patron auth surface (Hono-native).
//
// Wave 9.1 introduces:
//   - `requirePatron()` ............ requires a Steward HS256 bearer; ensures
//                                    a `patron_users` row exists (auto-provisions
//                                    on first sign-in); attaches `c.var.patron`.
//   - `requireAgentOwnership()` .... must run AFTER `requirePatron()`. Verifies
//                                    the patron owns the agent identified by a
//                                    route param (default `:id`). Sets
//                                    `c.var.patronAgent`. Accepts steward-id
//                                    match OR a wallet-address fallback while
//                                    `agent_personas.owner_steward_user_id` is
//                                    being backfilled (W9.4).
//   - `failFastIfMisconfigured()` .. boot-time check that calls `process.exit(1)`
//                                    when `STEWARD_JWT_SECRET` / `STEWARD_TENANT_ID`
//                                    are missing in production.
//
// Until W9.2 retires every legacy caller, this module also re-exports the
// launch-only middleware that used to live here (now in
// `legacy-patron-launch-auth.ts`).

import { agentPersonas, getDatabase, launches, patronUsers, patronWallets } from "@waifufun/db";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { verifySiweMessage } from "../lib/auth-service.js";
import type { AppBindings } from "../lib/bindings.js";
import { type WalletChain, ensurePrimaryPatronWallet, pickPrimaryWallet } from "../lib/patron-wallet.js";
import { type StewardAuthPrincipal, verifyStewardJwt } from "./steward-auth.js";

// Re-export the legacy launch auth surface for back-compat. W9.2 retires the
// callers; once that lands, these re-exports go away.
export {
	__setPatronAuthDbForTest,
	__setPatronAuthSessionResolverForTest,
	type PatronLaunchAuthBindings,
	type PatronLaunchAuthContext,
	type SessionWalletResolver,
	requirePatronLaunchAuth,
	requirePatronLaunchAuthorization,
} from "./legacy-patron-launch-auth.js";

// ─── Public types ──────────────────────────────────────────────────

export type PatronContext = {
	/** `patron_users.id` (uuid). */
	id: string;
	stewardUserId: string;
	email: string | null;
	primaryAddress: string | null;
	primaryChain?: WalletChain | null;
};

export type AgentOwnershipContext = {
	/** `agent_personas.id` (uuid). */
	id: string;
	/** Stable internal agent slug (`agent_personas.agent_id`). */
	agentId: string;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};

export type RequirePatronBindings = AppBindings & {
	Variables: AppBindings["Variables"] & {
		patron: PatronContext;
	};
};

export type RequireAgentOwnershipBindings = RequirePatronBindings & {
	Variables: RequirePatronBindings["Variables"] & {
		patronAgent: AgentOwnershipContext;
	};
};

// ─── Test-injection hooks ─────────────────────────────────────────

export type StewardParser = (raw: string) => Promise<StewardAuthPrincipal | null>;

type DbHandle = ReturnType<typeof getDatabase>["db"];

let dbForTest: DbHandle | undefined;
let stewardParserForTest: StewardParser | undefined;
let walletSiweVerifierForTest: typeof verifySiweMessage | undefined;
let recordPrimaryWalletsForTest = false;

export function __setRequirePatronDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

export function __setRequirePatronStewardParserForTest(parser: StewardParser | undefined): void {
	stewardParserForTest = parser;
}

export function __setRequireWalletSiweVerifierForTest(verifier: typeof verifySiweMessage | undefined): void {
	walletSiweVerifierForTest = verifier;
}

export function __setRequirePatronRecordPrimaryWalletsForTest(enabled: boolean): void {
	recordPrimaryWalletsForTest = enabled;
}

function getDb(): DbHandle {
	if (dbForTest) return dbForTest;
	return getDatabase().db;
}

function extractBearer(authHeader: string | undefined): string | null {
	if (!authHeader) return null;
	if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
	const raw = authHeader.slice(7).trim();
	return raw.length > 0 ? raw : null;
}

// W9.5: cookie fallback. Steward's OAuth flow can't expose the JWT to JS
// without weakening security, so the only way to authenticate browser-driven
// mutations is to bind the JWT into an HttpOnly cookie at /auth/oauth/finalize.
// `requirePatron()` accepts that cookie when no Bearer header is present.
const SESSION_COOKIE = "wf_session";

function extractSessionCookie(cookieHeader: string | undefined): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const idx = part.indexOf("=");
		if (idx < 0) continue;
		const key = part.slice(0, idx).trim();
		if (key !== SESSION_COOKIE) continue;
		const value = part.slice(idx + 1).trim();
		return value.length > 0 ? value : null;
	}
	return null;
}

// ─── requirePatron ────────────────────────────────────────────────

/**
 * Requires a valid Steward HS256 bearer. Attaches `c.var.patron` on success.
 *
 * Behaviour:
 *   - Missing / non-Bearer Authorization header → 401.
 *   - Steward verification returns null → 401 (invalid token, wrong tenant,
 *     or `STEWARD_JWT_SECRET` missing).
 *   - Otherwise: looks up `patron_users` by `steward_user_id`; if none,
 *     inserts a fresh row (first-sign-in handshake) and uses that row.
 *
 * Note: this middleware does NOT also accept the legacy SIWE JWT or the
 * X-OAuth cookie session, those flows have their own existing middleware.
 * Wave 9.2 will migrate mutating routes onto this one.
 */
export function requirePatron(): MiddlewareHandler<RequirePatronBindings> {
	return async (c, next) => {
		// Authorization header takes precedence (matches the Bearer-first design),
		// with the wf_session cookie as a fallback for browser-driven flows.
		const raw =
			extractBearer(c.req.header("authorization") ?? c.req.header("Authorization")) ??
			extractSessionCookie(c.req.header("cookie"));
		if (!raw) {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "missing bearer token or session cookie" }, 401);
		}

		const parser = stewardParserForTest ?? verifyStewardJwt;
		const principal = await parser(raw);
		if (!principal || !principal.userId) {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "steward jwt required" }, 401);
		}

		const db = getDb();
		const existing = await db
			.select()
			.from(patronUsers)
			.where(eq(patronUsers.stewardUserId, principal.userId))
			.limit(1);

		let row = existing[0];
		if (!row) {
			// First sign-in: provision a patron row from the Steward principal.
			// `x_user_id` and `x_handle` are NOT NULL in the schema; until W9.4's
			// NOT-NULL relaxation lands, write a synthetic placeholder so the
			// Steward-only patron has a stable identifier. Real X linkage happens
			// later via the existing X-OAuth flow.
			const placeholder = `steward:${principal.userId}`;
			const inserted = await db
				.insert(patronUsers)
				.values({
					xUserId: placeholder,
					xHandle: placeholder,
					stewardUserId: principal.userId,
					primaryEmail: principal.email ?? null,
				})
				.returning();
			row = inserted[0];
		}

		if (!row) {
			return c.json({ ok: false, error: "PATRON_PROVISION_FAILED", message: "could not load patron row" }, 500);
		}

		const primaryWallet = pickPrimaryWallet(principal);
		c.set("patron", {
			id: row.id,
			stewardUserId: row.stewardUserId ?? principal.userId,
			email: row.primaryEmail ?? principal.email ?? null,
			primaryAddress: primaryWallet?.address ?? null,
			primaryChain: primaryWallet?.chain ?? null,
		});

		await next();

		if (primaryWallet && (!dbForTest || recordPrimaryWalletsForTest)) {
			try {
				await ensurePrimaryPatronWallet(db, row.id, primaryWallet);
			} catch {
				// Wallet recording is best-effort so auth remains available if a transient DB state cannot write the row.
			}
		}
	};
}

// ─── requireAgentOwnership ─────────────────────────────────────────

/**
 * Requires `c.var.patron` (call AFTER `requirePatron()`). Looks up the agent
 * persona by route param (default `:id`) and verifies the patron owns it.
 *
 * Ownership logic (in order):
 *   1. PREFERRED: `agent_personas.owner_steward_user_id === patron.stewardUserId`.
 *   2. FALLBACK (until W9.4 backfill completes): `patron.primaryAddress`
 *      matches `agent_personas.owner_address` (case-insensitive).
 */
export function requireAgentOwnership(paramName = "id"): MiddlewareHandler<RequireAgentOwnershipBindings> {
	return async (c, next) => {
		const patron = c.get("patron");
		if (!patron) {
			return c.json(
				{
					ok: false,
					error: "PATRON_AUTH_REQUIRED",
					message: "requirePatron() must run before requireAgentOwnership()",
				},
				500,
			);
		}

		const agentId = c.req.param(paramName);
		if (!agentId) {
			return c.json({ ok: false, error: "BAD_REQUEST", message: `missing route param :${paramName}` }, 400);
		}

		const db = getDb();
		const rows = await db.select().from(agentPersonas).where(eq(agentPersonas.id, agentId)).limit(1);
		let agent = rows[0];

		// Most newer patron routes pass the persona UUID as `:id`, but a few
		// legacy v2 routes still use the stable agent slug (`agent_personas.agent_id`).
		// Accept both during Wave 9 so adding ownership middleware doesn't break
		// existing clients.
		if (!agent) {
			const byAgentId = await db.select().from(agentPersonas).where(eq(agentPersonas.agentId, agentId)).limit(1);
			agent = byAgentId[0];
		}
		if (!agent) {
			return c.json({ ok: false, error: "NOT_FOUND", message: "agent not found" }, 404);
		}

		const ownerStewardUserId = agent.ownerStewardUserId ?? null;
		const ownerAddress = agent.ownerAddress ?? null;

		const stewardMatch = ownerStewardUserId !== null && ownerStewardUserId === patron.stewardUserId;
		const addressMatch =
			patron.primaryAddress !== null &&
			ownerAddress !== null &&
			patron.primaryAddress.toLowerCase() === ownerAddress.toLowerCase();

		if (!stewardMatch && !addressMatch) {
			return c.json({ ok: false, error: "FORBIDDEN", message: "patron does not own this agent" }, 403);
		}

		c.set("patronAgent", {
			id: agent.id,
			agentId: agent.agentId,
			ownerStewardUserId,
			ownerAddress,
		});

		await next();
	};
}

export type WalletOwnershipBindings = AppBindings & {
	Variables: AppBindings["Variables"] & {
		patron: PatronContext;
		patronAgent: AgentOwnershipContext;
		wallet: `0x${string}`;
	};
};

type WalletResolutionBody = {
	siwe?: { message?: unknown; signature?: unknown };
	address?: unknown;
};

async function readWalletResolutionBody(c: Parameters<MiddlewareHandler>[0]): Promise<WalletResolutionBody> {
	try {
		return (await c.req.raw.clone().json()) as WalletResolutionBody;
	} catch {
		return {};
	}
}

async function resolveAgentForOwnership(db: DbHandle, routeId: string) {
	const byPersonaId = await db.select().from(agentPersonas).where(eq(agentPersonas.id, routeId)).limit(1);
	if (byPersonaId[0]) return byPersonaId[0];

	const byAgentId = await db.select().from(agentPersonas).where(eq(agentPersonas.agentId, routeId)).limit(1);
	if (byAgentId[0]) return byAgentId[0];

	const byLaunch = await db
		.select({
			id: agentPersonas.id,
			agentId: agentPersonas.agentId,
			ownerStewardUserId: agentPersonas.ownerStewardUserId,
			ownerAddress: agentPersonas.ownerAddress,
		})
		.from(launches)
		.leftJoin(agentPersonas, eq(launches.agentId, agentPersonas.id))
		.where(eq(launches.id, routeId))
		.limit(1);

	return byLaunch[0] ?? null;
}

async function resolveRequestWallet(
	db: DbHandle,
	patron: PatronContext,
	body: WalletResolutionBody,
): Promise<string | null> {
	const siwe = body.siwe;
	if (siwe && typeof siwe === "object" && typeof siwe.message === "string" && typeof siwe.signature === "string") {
		const verified = await (walletSiweVerifierForTest ?? verifySiweMessage)(siwe.message, siwe.signature).catch(
			() => null,
		);
		return verified?.address.toLowerCase() ?? null;
	}

	if (typeof body.address === "string") {
		return body.address.toLowerCase();
	}

	const primary = await db
		.select()
		.from(patronWallets)
		.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.isPrimary, true)))
		.limit(1);

	return primary[0]?.address ?? null;
}

/**
 * Requires a patron-bound wallet that owns the agent associated with `:id`.
 *
 * The route id can be an agent_personas.id, agent_personas.agent_id, or a
 * launches.id that points at an agent persona (the /launches/:id/authorize
 * migration path). The current wallet is resolved from fresh body.siwe,
 * body.address, or the patron's primary wallet, then checked against
 * patron_wallets and agent_personas.owner_address.
 */
export function requireWalletOwnership(paramName = "id"): MiddlewareHandler<WalletOwnershipBindings> {
	return async (c, next) => {
		const patron = c.get("patron");
		if (!patron) {
			return c.json(
				{
					ok: false,
					error: "PATRON_AUTH_REQUIRED",
					message: "requirePatron() must run before requireWalletOwnership()",
				},
				500,
			);
		}

		const routeId = c.req.param(paramName);
		if (!routeId) {
			return c.json({ ok: false, error: "BAD_REQUEST", message: `missing route param :${paramName}` }, 400);
		}

		const db = getDb();
		const resolvedAddress = await resolveRequestWallet(db, patron, await readWalletResolutionBody(c));
		if (!resolvedAddress || !/^0x[0-9a-f]{40}$/.test(resolvedAddress)) {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "no wallet resolved" }, 401);
		}

		const bound = await db
			.select()
			.from(patronWallets)
			.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, resolvedAddress)))
			.limit(1);
		if (bound.length === 0) {
			return c.json({ ok: false, error: "FORBIDDEN", message: "wallet not bound to patron" }, 403);
		}

		const agent = await resolveAgentForOwnership(db, routeId);
		if (!agent) return c.json({ ok: false, error: "NOT_FOUND", message: "agent not found" }, 404);

		const ownerAddress = agent.ownerAddress ?? null;
		if (!ownerAddress || ownerAddress.toLowerCase() !== resolvedAddress) {
			return c.json({ ok: false, error: "FORBIDDEN", message: "wallet does not own agent" }, 403);
		}

		c.set("wallet", resolvedAddress as `0x${string}`);
		c.set("patronAgent", {
			id: agent.id,
			agentId: agent.agentId,
			ownerStewardUserId: agent.ownerStewardUserId ?? null,
			ownerAddress,
		} as AgentOwnershipContext);

		await next();
	};
}

// ─── failFastIfMisconfigured ───────────────────────────────────────

const CANONICAL_TENANT = "waifu";

/**
 * Boot-time misconfiguration check. Calls `process.exit(1)` if production is
 * missing `STEWARD_JWT_SECRET` / `JWT_SECRET` (or either is shorter than 32
 * chars), or if `STEWARD_TENANT_ID` is missing / non-canonical.
 *
 * Designed to be called at module-init time from the app entry point BEFORE
 * `serve()` / `Bun.serve()` / `app.fire()`.
 */
export function failFastIfMisconfigured(env: NodeJS.ProcessEnv = process.env): void {
	if (env.NODE_ENV !== "production") return;

	const secret = env.STEWARD_JWT_SECRET;
	if (!secret || secret.length < 32) {
		console.error("[fatal] STEWARD_JWT_SECRET missing or shorter than 32 chars in production. Refusing to boot.");
		process.exit(1);
		return;
	}

	const jwtSecret = env.JWT_SECRET;
	if (!jwtSecret || jwtSecret.length < 32) {
		console.error("[fatal] JWT_SECRET missing or shorter than 32 chars in production. Refusing to boot.");
		process.exit(1);
		return;
	}

	const tenant = env.STEWARD_TENANT_ID;
	if (tenant !== CANONICAL_TENANT) {
		console.error(`[fatal] STEWARD_TENANT_ID=${tenant} (canonical: "${CANONICAL_TENANT}")`);
		process.exit(1);
		return;
	}
}
