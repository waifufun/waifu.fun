import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Logger } from "pino";
import type { AppDependencies } from "./contracts/services.js";
import type { AppBindings } from "./lib/bindings.js";
import { respondOk } from "./lib/http.js";
import { logger as defaultLogger } from "./lib/logger.js";
import { optionalAuth } from "./middleware/auth.js";
import { apiErrorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { rateLimit } from "./middleware/rate-limit.js";
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

export function createApp(deps: AppDependencies, logger: Logger = defaultLogger) {
	const app = new Hono<AppBindings>();

	app.use("*", attachRequestContext(deps, logger));
	app.use(
		"*",
		cors({
			origin: deps.config.app.corsOrigins,
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization", "X-User-Address", "X-User-Role"],
			// Required so `fetch(..., { credentials: 'include' })` attaches the
			// patron session cookie on cross-origin requests (www.waifu.fun →
			// api.waifu.fun). Without this, browsers drop the cookie silently
			// and /auth/twitter/me always returns { user: null }.
			credentials: true,
		}),
	);
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

	app.use("/auth/*", rateLimit({ bucket: "auth" }));
	app.use("/launches/*", rateLimit({ bucket: "launch" }));
	app.use("/trades/*", rateLimit({ bucket: "trade" }));
	app.use("/agents/*", rateLimit({ bucket: "trade" }));
	app.use("/jobs/*", rateLimit({ bucket: "trade" }));
	app.use("/admin/*", rateLimit({ bucket: "admin" }));

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
