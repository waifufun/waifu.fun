/**
 * Steward identity resolution for the patron trading-policy proxy.
 *
 * Most waifu agents live under the canonical Steward tenant (`waifu`) and are
 * addressed by their waifu slug (`agent_personas.agent_id`). Those are reachable
 * with the tenant-scoped API key (`STEWARD_API_KEY` / `X-Steward-Key`).
 *
 * BUT cloud-provisioned agents (e.g. Sol the Architect) have their Steward
 * identity under a DIFFERENT tenant. Sol's waifu slug is `sol-the-architect`,
 * but her real Steward identity is `agentId=sol-waifu` under tenant
 * `elizacloud`. The waifu tenant key is scoped to tenant `waifu` and gets a 403
 * "Forbidden" when it tries to read `elizacloud`, so we CANNOT use it for these.
 *
 * The escape hatch: waifu-core holds `STEWARD_JWT_SECRET`, which signs the SAME
 * HS256 bearers Steward accepts cross-tenant. When an agent has a
 * `steward_agent_id` set, we mint a short-lived bearer for
 * (tenant = STEWARD_CLOUD_TENANT_ID, agentId = steward_agent_id) and call Steward
 * with `Authorization: Bearer` instead of the tenant key.
 *
 * Verified live (2026-06-03): a bearer minted with STEWARD_JWT_SECRET claiming
 * {agentId:"sol-waifu", tenantId:"elizacloud", scopes:[agent, api:proxy,
 * trade:read, trade:hyperliquid:write]} reads Sol's policy under elizacloud -> 200.
 */

import { SignJWT } from "jose";

import { type StewardClient, createStewardClient } from "./steward.js";

/** Default tenant a cloud agent's Steward identity lives under. */
const DEFAULT_CLOUD_TENANT_ID = "elizacloud";

/** Scopes baked into the minted proxy bearer (policy read/write, trade read). */
const PROXY_BEARER_SCOPES = ["agent", "api:proxy", "trade:read", "trade:hyperliquid:write"];

/** Short bearer lifetime: the proxy call is one round-trip, no need to persist. */
const BEARER_TTL_SECONDS = 120;

export type StewardIdentity = {
	/** The agentId to address Steward with. */
	stewardAgentId: string;
	/** The Steward tenant the agent lives under. */
	tenantId: string;
	/**
	 * "tenant-key" -> reachable with the waifu tenant API key (default path).
	 * "bearer"     -> requires a minted HS256 bearer (cloud / cross-tenant agent).
	 */
	auth: "tenant-key" | "bearer";
};

export type ResolveStewardIdentityInput = {
	/** The waifu slug (`agent_personas.agent_id`). */
	waifuSlug: string;
	/** The agent's real Steward agentId (`agent_personas.steward_agent_id`), if set. */
	stewardAgentId: string | null | undefined;
	env?: NodeJS.ProcessEnv;
};

/**
 * Decide how to address Steward for a given agent.
 *
 * - `steward_agent_id` set  -> cloud agent: address it as that id under the
 *   cloud tenant (default `elizacloud`, overridable via STEWARD_CLOUD_TENANT_ID),
 *   authenticated with a minted bearer.
 * - `steward_agent_id` null -> default: use the waifu slug under the canonical
 *   waifu tenant with the tenant API key.
 */
export function resolveStewardIdentity(input: ResolveStewardIdentityInput): StewardIdentity {
	const env = input.env ?? process.env;
	const trimmedStewardAgentId = input.stewardAgentId?.trim();
	if (trimmedStewardAgentId) {
		return {
			stewardAgentId: trimmedStewardAgentId,
			tenantId: env.STEWARD_CLOUD_TENANT_ID?.trim() || DEFAULT_CLOUD_TENANT_ID,
			auth: "bearer",
		};
	}
	return {
		stewardAgentId: input.waifuSlug,
		tenantId: env.STEWARD_TENANT_ID?.trim() || "waifu",
		auth: "tenant-key",
	};
}

/** Mint a short-lived HS256 bearer for (tenantId, agentId) using STEWARD_JWT_SECRET. */
export async function mintStewardAgentBearer(
	tenantId: string,
	agentId: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
	const secret = env.STEWARD_JWT_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error("mintStewardAgentBearer: STEWARD_JWT_SECRET missing or too short");
	}
	const key = new TextEncoder().encode(secret);
	return new SignJWT({
		agentId,
		tenantId,
		scopes: PROXY_BEARER_SCOPES,
		scope: "agent",
	})
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setIssuer("steward")
		.setAudience("steward-api")
		.setIssuedAt()
		.setExpirationTime(`${BEARER_TTL_SECONDS}s`)
		.sign(key);
}

/**
 * Build a StewardClient scoped to the right tenant + auth for `identity`.
 *
 * Returns null when the required credential is missing (so callers can return a
 * clean 503 instead of throwing). For the bearer path that means
 * STEWARD_JWT_SECRET is absent; for the tenant-key path, STEWARD_API_KEY.
 */
export async function buildStewardClientForIdentity(
	identity: StewardIdentity,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl?: typeof fetch,
): Promise<StewardClient | null> {
	const baseUrl = env.STEWARD_API_URL;
	if (!baseUrl) return null;

	if (identity.auth === "bearer") {
		if (!env.STEWARD_JWT_SECRET || env.STEWARD_JWT_SECRET.length < 32) return null;
		const bearerToken = await mintStewardAgentBearer(identity.tenantId, identity.stewardAgentId, env);
		return createStewardClient({
			baseUrl,
			bearerToken,
			tenantId: identity.tenantId,
			...(fetchImpl ? { fetchImpl } : {}),
		});
	}

	const apiKey = env.STEWARD_API_KEY;
	if (!apiKey) return null;
	return createStewardClient({ baseUrl, apiKey, tenantId: identity.tenantId, ...(fetchImpl ? { fetchImpl } : {}) });
}
