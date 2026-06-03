import { Hono } from "hono";
import RedisModule from "ioredis";
import type { Redis, RedisOptions } from "ioredis";

import { agentPersonas, agentXAccounts, getDatabase } from "@waifufun/db";
import { getRedisUrl, redisOptionsFromEnv } from "@waifufun/redis/config";
import { eq } from "drizzle-orm";

import type { AppBindings } from "../../lib/bindings.js";
import { encryptEnvelope } from "../../lib/crypto/envelope.js";
import {
	AGENT_X_SCOPES,
	buildAuthorizationUrl,
	deriveCodeChallenge,
	exchangeCodeForToken,
	fetchXUser,
	generateCodeVerifier,
	generateState,
	getTwitterOAuthConfig,
} from "../../lib/twitter-oauth.js";
import { requirePatronAuth } from "../../middleware/human-auth.js";
import type { PatronBindings } from "../../middleware/human-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import type { RequireAgentOwnershipBindings } from "../../middleware/patron-auth.js";

const app = new Hono<AppBindings & PatronBindings & RequireAgentOwnershipBindings>();
const STATE_TTL_SECONDS = 5 * 60;
const RedisClient = RedisModule as unknown as new (url: string, options: RedisOptions) => Redis;
const redis = new RedisClient(
	getRedisUrl(),
	redisOptionsFromEnv(process.env, {
		connectionName: "waifu-api:agent-x-oauth",
		maxRetriesPerRequest: 2,
		enableReadyCheck: false,
		lazyConnect: true,
	}),
);

interface AgentXOAuthState {
	agentId: string;
	patronUserId: string;
	patronXUserId?: string;
	codeVerifier: string;
	createdAt: string;
}

type Db = NonNullable<ReturnType<typeof requireDb>>;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function agentRedirectUri(agentId: string): string {
	return (
		process.env.X_REDIRECT_URI_AGENT?.replace(":agentId", agentId).replace("AGENT_ID", agentId) ??
		`${process.env.API_PUBLIC_URL ?? "http://localhost:3100"}/v2/agents/${encodeURIComponent(agentId)}/x/oauth/callback`
	);
}

function stateKey(state: string): string {
	return `wf:agent-x-oauth-state:${state}`;
}

function frontendAgentUrl(agentId: string, query: string): string {
	const frontendUrl = process.env.FRONTEND_URL ?? "https://waifu.fun";
	return `${frontendUrl}/agent/${encodeURIComponent(agentId)}?${query}`;
}

async function requirePatronOwnsAgent(db: Db, agentId: string, xUserId: string) {
	const [persona] = await db
		.select({
			agentId: agentPersonas.agentId,
			claimedByXUserId: agentPersonas.claimedByXUserId,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);

	if (!persona) {
		return { ok: false as const, status: 404 as const, error: "agent not found" };
	}

	if (persona.claimedByXUserId !== xUserId) {
		return {
			ok: false as const,
			status: 403 as const,
			error: "only the agent patron can manage X",
		};
	}

	return { ok: true as const };
}

app.post("/:agentId/x/oauth/start", requirePatron(), requireAgentOwnership("agentId"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const patron = c.get("patron");
	const agentId = c.get("patronAgent").agentId;

	const oauthConfig = getTwitterOAuthConfig({
		redirectUriEnv: "X_REDIRECT_URI_AGENT",
		defaultRedirectUri: agentRedirectUri(agentId),
	});
	if (!oauthConfig) {
		return c.json(
			{
				ok: false,
				error: "TWITTER_AUTH_NOT_CONFIGURED",
				message: "X_CLIENT_ID and X_CLIENT_SECRET are required for agent X OAuth.",
			},
			501,
		);
	}

	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = deriveCodeChallenge(codeVerifier);
	const statePayload: AgentXOAuthState = {
		agentId,
		patronUserId: patron.id,
		codeVerifier,
		createdAt: new Date().toISOString(),
	};

	await redis.set(stateKey(state), JSON.stringify(statePayload), "EX", STATE_TTL_SECONDS);

	return c.json({
		authorizeUrl: buildAuthorizationUrl({
			clientId: oauthConfig.clientId,
			redirectUri: oauthConfig.redirectUri,
			state,
			codeChallenge,
			scopes: AGENT_X_SCOPES,
		}),
	});
});

app.get("/:agentId/x/oauth/callback", async (c) => {
	const agentId = c.req.param("agentId");
	const db = requireDb();
	if (!db) return c.redirect(frontendAgentUrl(agentId, "x_error=database"));

	const error = c.req.query("error");
	if (error) return c.redirect(frontendAgentUrl(agentId, `x_error=${encodeURIComponent(error)}`));

	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) return c.redirect(frontendAgentUrl(agentId, "x_error=missing_code"));

	let rawState: string | null;
	try {
		rawState = await redis.get(stateKey(state));
		await redis.del(stateKey(state));
	} catch (err) {
		c.get("logger").error({ agentId, error: err }, "agents x oauth callback state lookup failed");
		return c.redirect(frontendAgentUrl(agentId, "x_error=state_unavailable"));
	}
	if (!rawState) return c.redirect(frontendAgentUrl(agentId, "x_error=state_expired"));

	let oauthState: AgentXOAuthState;
	try {
		oauthState = JSON.parse(rawState) as AgentXOAuthState;
	} catch {
		return c.redirect(frontendAgentUrl(agentId, "x_error=state_invalid"));
	}

	if (oauthState.agentId !== agentId || !oauthState.patronUserId) {
		return c.redirect(frontendAgentUrl(agentId, "x_error=state_mismatch"));
	}

	const oauthConfig = getTwitterOAuthConfig({
		redirectUriEnv: "X_REDIRECT_URI_AGENT",
		defaultRedirectUri: agentRedirectUri(agentId),
	});
	if (!oauthConfig) return c.redirect(frontendAgentUrl(agentId, "x_error=not_configured"));

	try {
		const tokenData = await exchangeCodeForToken({
			code,
			codeVerifier: oauthState.codeVerifier,
			redirectUri: oauthConfig.redirectUri,
			clientId: oauthConfig.clientId,
			clientSecret: oauthConfig.clientSecret,
		});
		const xUser = await fetchXUser(tokenData.access_token);
		const now = new Date();
		const tokenExpiresAt = tokenData.expires_in ? new Date(now.getTime() + tokenData.expires_in * 1000) : null;
		const encryptedAccessToken = encryptEnvelope(tokenData.access_token);
		const encryptedRefreshToken = tokenData.refresh_token ? encryptEnvelope(tokenData.refresh_token) : null;

		await db
			.insert(agentXAccounts)
			.values({
				agentId,
				xUserId: xUser.id,
				xHandle: xUser.username,
				xDisplayName: xUser.name ?? null,
				xAvatarUrl: xUser.profile_image_url ?? null,
				encryptedAccessToken,
				encryptedRefreshToken,
				scope: tokenData.scope ?? AGENT_X_SCOPES.join(" "),
				tokenExpiresAt,
				lastRefreshedAt: now,
				refreshFailureCount: "0",
				authorizedByPatronUserId: oauthState.patronUserId,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: agentXAccounts.agentId,
				set: {
					xUserId: xUser.id,
					xHandle: xUser.username,
					xDisplayName: xUser.name ?? null,
					xAvatarUrl: xUser.profile_image_url ?? null,
					encryptedAccessToken,
					encryptedRefreshToken,
					scope: tokenData.scope ?? AGENT_X_SCOPES.join(" "),
					tokenExpiresAt,
					lastRefreshedAt: now,
					refreshFailureCount: "0",
					authorizedByPatronUserId: oauthState.patronUserId,
					updatedAt: now,
				},
			});

		return c.redirect(frontendAgentUrl(agentId, "x_connected=1"));
	} catch (err) {
		c.get("logger").error({ agentId, error: err }, "agents x oauth callback failed");
		return c.redirect(frontendAgentUrl(agentId, "x_error=callback_failed"));
	}
});

app.delete("/:agentId/x/disconnect", requirePatron(), requireAgentOwnership("agentId"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const agentId = c.get("patronAgent").agentId;

	// Hard delete: token envelopes are removed immediately; reconnect requires a fresh OAuth grant.
	await db.delete(agentXAccounts).where(eq(agentXAccounts.agentId, agentId));
	return c.json({ ok: true });
});

// Canonical status read for the patron X-connection panel.
//
// Mirrors the legacy `GET /:agentId/x` connected-check but uses the Wave 9
// `requirePatron` + `requireAgentOwnership` middleware pair (same auth as the
// oauth/start + disconnect mutations, so the panel never sees a 403/404 just
// because the read used a different auth path). The frontend `useXConnection`
// hook polls this; it must always 200 with a connected flag (never a scary
// red error) when the patron owns the agent. Shape:
//   { connected: boolean, xHandle: string|null, connectedAt: string|null }
app.get("/:agentId/x/status", requirePatron(), requireAgentOwnership("agentId"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const agentId = c.get("patronAgent").agentId;

	const [account] = await db
		.select({
			xHandle: agentXAccounts.xHandle,
			createdAt: agentXAccounts.createdAt,
		})
		.from(agentXAccounts)
		.where(eq(agentXAccounts.agentId, agentId))
		.limit(1);

	if (!account) {
		return c.json({ connected: false, xHandle: null, connectedAt: null });
	}

	return c.json({
		connected: true,
		xHandle: account.xHandle,
		connectedAt: account.createdAt?.toISOString() ?? null,
	});
});

app.get("/:agentId/x", requirePatronAuth(), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const patronUser = c.get("patronUser");
	if (!patronUser) return c.json({ error: "not authenticated" }, 401);

	const agentId = c.req.param("agentId");
	const ownership = await requirePatronOwnsAgent(db, agentId, patronUser.xUserId);
	if (!ownership.ok) return c.json({ error: ownership.error }, ownership.status);

	const [account] = await db
		.select({
			xHandle: agentXAccounts.xHandle,
			xDisplayName: agentXAccounts.xDisplayName,
			xAvatarUrl: agentXAccounts.xAvatarUrl,
			tokenExpiresAt: agentXAccounts.tokenExpiresAt,
		})
		.from(agentXAccounts)
		.where(eq(agentXAccounts.agentId, agentId))
		.limit(1);

	if (!account) return c.json({ connected: false });

	return c.json({
		connected: true,
		xHandle: account.xHandle,
		xDisplayName: account.xDisplayName,
		xAvatarUrl: account.xAvatarUrl,
		tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
	});
});

export default app;
