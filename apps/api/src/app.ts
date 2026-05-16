import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Logger } from "pino";
import type { AppDependencies } from "./contracts/services.js";
import type { AppBindings } from "./lib/bindings.js";
import { respondOk } from "./lib/http.js";
import { logger as defaultLogger } from "./lib/logger.js";
import { optionalAuth } from "./middleware/auth.js";
import { apiErrorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { type RateLimitStore, rateLimit } from "./middleware/rate-limit.js";
import { attachRequestContext } from "./middleware/request-context.js";
import { createAdminKeysRoutes } from "./routes/admin-keys.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createAgentRoutes, createJobRoutes } from "./routes/agents.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createCreatorRoutes } from "./routes/creators.js";
import { createEmailAuthRoutes } from "./routes/email-auth.js";
import { createHealthRoutes } from "./routes/health.js";
import { createLaunchRoutes } from "./routes/launches.js";
import { createMetaRoutes } from "./routes/meta.js";
import { createMetricsRoutes } from "./routes/metrics.js";
import { createOAuthRoutes } from "./routes/oauth.js";
import { createPasskeyAuthRoutes } from "./routes/passkey-auth.js";
import { createTokenRoutes } from "./routes/tokens.js";
import { createTradeRoutes } from "./routes/trades.js";
import v2Routes from "./routes/v2/index.js";
import v3Routes from "./routes/v3/index.js";

export interface CreateAppOptions {
	rateLimitStore?: RateLimitStore;
}

export function createApp(deps: AppDependencies, logger: Logger = defaultLogger, options: CreateAppOptions = {}) {
	const app = new Hono<AppBindings>();
	const limit = (bucket: string) =>
		rateLimit({ bucket, ...(options.rateLimitStore ? { store: options.rateLimitStore } : {}) });

	app.use("*", attachRequestContext(deps, logger));

	// Permissive CORS for Blink (Blockchain Link) discovery URLs. Wallets and
	// third-party renderers fetch these from arbitrary origins, so the global
	// allowlist below must NOT gate them. Mounted BEFORE the global cors so
	// the wildcard handles `OPTIONS` preflight first.
	app.use(
		"/v2/agents/:token/blink",
		cors({
			origin: "*",
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Content-Encoding", "Accept-Encoding"],
		}),
	);

	// The credentialled global cors must skip Blink paths. Combining
	// `Access-Control-Allow-Origin: *` (set by the wildcard above) with
	// `Access-Control-Allow-Credentials: true` (which Hono's cors emits
	// unconditionally when `credentials: true`) is a CORS spec violation that
	// browsers reject. Blink endpoints are public — they don't carry session
	// cookies — so credentials handling is unnecessary there anyway.
	const blinkPathRe = /^\/v2\/agents\/[^/]+\/blink$/;
	const credentialedCors = cors({
		origin: deps.config.app.corsOrigins,
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "X-User-Address", "X-User-Role"],
		// Required so `fetch(..., { credentials: 'include' })` attaches the
		// patron session cookie on cross-origin requests (www.waifu.fun →
		// api.waifu.fun). Without this, browsers drop the cookie silently
		// and /auth/twitter/me always returns { user: null }.
		credentials: true,
	});
	app.use("*", async (c, next) => {
		if (blinkPathRe.test(c.req.path)) return next();
		return credentialedCors(c, next);
	});

	app.use("*", optionalAuth());

	app.get("/", (c) =>
		respondOk(c, {
			service: deps.config.app.name,
			version: "0.2.0-scaffold",
			compatibilityMode: deps.runtime.compatibilityMode,
			routeGroups: ["health", "auth", "tokens", "launches", "creators", "trades", "agents", "jobs", "admin"],
			notes: deps.runtime.notes,
		}),
	);

	app.use("/auth/*", limit("auth"));
	app.use("/launches", limit("launch"));
	app.use("/launches/*", limit("launch"));
	app.use("/trades/*", limit("trade"));
	app.use("/agents/*", limit("trade"));
	app.use("/jobs/*", limit("trade"));
	app.use("/admin/*", limit("admin"));
	app.use("/v2/auth/*", limit("auth"));
	app.use("/v2/admin/*", limit("admin"));
	app.use("/v2/launches", limit("launch"));
	app.use("/v2/launches/*", limit("launch"));
	app.use("/v2/agents/prepare", limit("launch"));
	app.use("/v2/agents/claim/*", limit("launch"));
	app.use("/v2/webhooks/*", limit("webhook"));
	app.use("/v3/agents", limit("v3-agent"));
	app.use("/v3/agents/*", limit("v3-agent"));

	app.route("/metrics", createMetricsRoutes());
	app.route("/health", createHealthRoutes());
	app.route("/auth", createAuthRoutes());
	// OAuth bridge to Steward's hosted OAuth providers (Google/GitHub/Discord/
	// Twitter). See routes/oauth.ts for the flow.
	app.route("/auth/oauth", createOAuthRoutes());
	// Email magic-link bridge (POST-only flow, separate from OAuth redirect).
	// See routes/email-auth.ts for the flow.
	app.route("/auth/email", createEmailAuthRoutes());
	// Passkey (WebAuthn) bridge — client-side ceremony, server-side mints session.
	// See routes/passkey-auth.ts for the flow.
	app.route("/auth/passkey", createPasskeyAuthRoutes());
	app.route("/tokens", createTokenRoutes());
	app.route("/launches", createLaunchRoutes());
	app.route("/creators", createCreatorRoutes());
	app.route("/trades", createTradeRoutes());
	app.route("/agents", createAgentRoutes());
	app.route("/jobs", createJobRoutes());
	// Mount agent-keys BEFORE the generic /admin router so its bearer-token
	// auth is used instead of the wallet-SIWE requireRole guard on /admin.
	app.route("/admin/agent-keys", createAdminKeysRoutes());
	app.route("/admin", createAdminRoutes());
	app.route("/v2", v2Routes);
	app.route("/v3", v3Routes);

	// Meta routes: AGENT.md + openapi.json served at root level
	const metaRoutes = createMetaRoutes();
	app.route("/", metaRoutes);

	app.notFound(notFoundHandler);
	app.onError(apiErrorHandler);

	return app;
}
