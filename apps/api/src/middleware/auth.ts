import type { MiddlewareHandler } from "hono";

import { type AuthPrincipal, type Role, rolePriority, roleSchema } from "../contracts/auth.js";
import { isProductionAuth, verifyJwt } from "../lib/auth-service.js";
import type { AppBindings } from "../lib/bindings.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { hasStewardAuth, verifyStewardJwt } from "./steward-auth.js";

function parseDevToken(token: string): AuthPrincipal | null {
	if (!token.startsWith("dev:")) return null;

	const [, address, role] = token.split(":");
	const parsedRole = roleSchema.safeParse(role);

	if (!address || !parsedRole.success) {
		return null;
	}

	return {
		address,
		role: parsedRole.data,
		authSource: "dev-bearer",
	};
}

async function parseJwtToken(token: string): Promise<AuthPrincipal | null> {
	try {
		const payload = await verifyJwt(token);
		const parsedRole = roleSchema.safeParse(payload.role);

		return {
			address: payload.address,
			role: parsedRole.success ? parsedRole.data : "creator",
			authSource: "jwt",
		};
	} catch {
		return null;
	}
}

async function parseStewardToken(token: string): Promise<AuthPrincipal | null> {
	if (!hasStewardAuth()) return null;

	const principal = await verifyStewardJwt(token);
	if (!principal) return null;

	// Map steward principal to app auth principal.
	// Use the wallet address from the steward token if present,
	// otherwise use a synthetic address derived from steward user ID.
	const address = principal.address ?? `steward:${principal.userId}`;

	return {
		address,
		role: "creator",
		authSource: "steward",
		stewardUserId: principal.userId,
	};
}

async function parseBearerToken(raw: string): Promise<AuthPrincipal | null> {
	// Always try steward JWT first (works in both prod and dev)
	const stewardResult = await parseStewardToken(raw);
	if (stewardResult) return stewardResult;

	// In production, try SIWE JWT and never fall back to dev-only auth paths.
	if (isProductionAuth()) {
		const jwtResult = await parseJwtToken(raw);
		if (jwtResult) return jwtResult;
		// In production, don't fall back to dev tokens
		return null;
	}

	// Dev mode: accept dev tokens, and also try JWT if available
	const devResult = parseDevToken(raw);
	if (devResult) return devResult;

	// Also try JWT in dev mode (for testing real auth flow)
	try {
		return await parseJwtToken(raw);
	} catch {
		return null;
	}
}

// W9.5: pull a wf_session cookie value if no Authorization header is present.
// Browser-driven flows (the OAuth callback) bind the Steward JWT into this
// HttpOnly cookie; without a fallback path here, every cookie-based mutation
// would land at the dashboard with `auth=null`.
function extractSessionCookie(cookieHeader: string | undefined): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const idx = part.indexOf("=");
		if (idx < 0) continue;
		const key = part.slice(0, idx).trim();
		if (key !== "wf_session") continue;
		const value = part.slice(idx + 1).trim();
		return value.length > 0 ? value : null;
	}
	return null;
}

export function optionalAuth(): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		const authorization = c.req.header("authorization");
		const headerAddress = c.req.header("x-user-address");
		const headerRole = c.req.header("x-user-role");

		let auth: AuthPrincipal | null = null;

		if (authorization) {
			const [, raw] = authorization.split(/\s+/, 2);
			if (raw) {
				auth = await parseBearerToken(raw);
			}
		} else {
			// No Authorization header — try the wf_session cookie. parseBearerToken
			// already routes Steward JWT first (and rejects the X-OAuth random
			// session token shape), so a stray X-OAuth cookie just yields `null`
			// here without disrupting the X-OAuth flow on /auth/twitter/me.
			const cookieToken = extractSessionCookie(c.req.header("cookie"));
			if (cookieToken) {
				auth = await parseBearerToken(cookieToken);
			}
		}

		if (!auth && headerAddress && !isProductionAuth()) {
			// Compat headers only in dev mode
			const parsedRole = roleSchema.safeParse(headerRole ?? "user");
			if (parsedRole.success) {
				auth = {
					address: headerAddress,
					role: parsedRole.data,
					authSource: "compat-header",
				};
			}
		}

		c.set("auth", auth);
		await next();
	};
}

export function requireAuth(): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		if (!c.get("auth")) {
			throw unauthorized();
		}

		await next();
	};
}

export function requireRole(minRole: Role): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		const auth = c.get("auth");
		if (!auth) {
			throw unauthorized();
		}

		if (rolePriority[auth.role] < rolePriority[minRole]) {
			throw forbidden(`Requires ${minRole} role`);
		}

		await next();
	};
}
