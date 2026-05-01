/**
 * human-auth.ts
 * Optional middleware that reads the patron session cookie and attaches
 * the patron user to `c.var.patronUser` if a valid session exists.
 *
 * Usage:
 *   import { attachPatronUser } from "../middleware/human-auth.js";
 *   app.use("/some-route/*", attachPatronUser());
 *
 * Then in a handler:
 *   const user = c.get("patronUser"); // SessionUser | null
 */

import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { extractSessionToken, validateSession } from "../lib/session.js";
import type { SessionUser } from "../lib/session.js";

/** Extended bindings that include patronUser. */
export type PatronBindings = AppBindings & {
	Variables: AppBindings["Variables"] & {
		patronUser: SessionUser | null;
	};
};

export function attachPatronUser(): MiddlewareHandler<PatronBindings> {
	return async (c, next) => {
		const token = extractSessionToken(c.req.header("cookie"));

		if (!token) {
			c.set("patronUser", null);
			await next();
			return;
		}

		const session = await validateSession(token).catch(() => null);
		c.set("patronUser", session?.user ?? null);
		await next();
	};
}

/** Middleware that requires a valid patron session. Returns 401 if missing. */
export function requirePatronAuth(): MiddlewareHandler<PatronBindings> {
	return async (c, next) => {
		const token = extractSessionToken(c.req.header("cookie"));

		if (!token) {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "Patron session required" }, 401);
		}

		const session = await validateSession(token).catch(() => null);
		if (!session) {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "Invalid or expired session" }, 401);
		}

		c.set("patronUser", session.user);
		await next();
	};
}
