/**
 * Agent bridge routes — proxy agent operations to milady-cloud.
 *
 * All routes follow the same `{ ok, data, requestId }` envelope used by the
 * rest of waifu-core.  Auth-required routes use SIWE (requireAuth middleware).
 */

import { Hono } from "hono";
import { z } from "zod";

import type { AppDependencies } from "../contracts/services.js";
import type { AppBindings } from "../lib/bindings.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { respondAccepted, respondOk } from "../lib/http.js";
import { parseJsonBody } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";
import { MiladyApiError, getMiladyClient } from "../services/milady-client.js";

// ─── Validation schemas ───────────────────────────────────────────

const createAgentSchema = z.object({
	agentName: z.string().trim().min(1).max(64),
	agentConfig: z.record(z.unknown()).optional(),
	/** Optional token address to link this agent to */
	tokenAddress: z.string().trim().min(1).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Derive a deterministic milady-cloud user ID from the SIWE wallet address.
 * milady-cloud expects a userId — we use a namespaced string so the
 * service-account JWT scopes to the correct wallet.
 */
import type { AuthPrincipal } from "../contracts/auth.js";

/**
 * Map auth principal to milady cloud userId.
 * Steward users: waifu:steward-{uuid} (stable across wallet changes)
 * Legacy wallet users: waifu:0x{address}
 */
function principalToUserId(auth: AuthPrincipal): string {
	if (auth.authSource === "steward" && auth.stewardUserId) {
		return `waifu:steward-${auth.stewardUserId}`;
	}
	return `waifu:${auth.address.toLowerCase()}`;
}

/** @deprecated Use principalToUserId instead */
function walletToUserId(address: string): string {
	return `waifu:${address.toLowerCase()}`;
}

function handleMiladyError(err: unknown): never {
	if (err instanceof MiladyApiError) {
		if (err.status === 403) throw forbidden(err.message);
		throw badRequest("MILADY_ERROR", err.message);
	}
	throw err;
}

/**
 * Link a milady-cloud agent to a waifu token.  Best-effort — does not throw
 * if the token doesn't exist or the update fails.
 */
async function linkAgentToToken(deps: AppDependencies, tokenAddress: string, agentId: string): Promise<void> {
	await deps.db.linkAgentToToken(tokenAddress, agentId);
}

// ─── Routes ───────────────────────────────────────────────────────

export function createAgentRoutes() {
	const app = new Hono<AppBindings>();

	// GET /agents/availability (public)
	app.get("/availability", async (c) => {
		const client = getMiladyClient();
		try {
			const data = await client.getAvailability();
			return respondOk(c, data);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// POST /agents (authenticated)
	app.post("/", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const body = await parseJsonBody(c, createAgentSchema);
		const client = getMiladyClient();

		try {
			const userId = principalToUserId(auth);
			const createInput: { agentName: string; agentConfig?: Record<string, unknown> | undefined } = {
				agentName: body.agentName,
			};
			if (body.agentConfig !== undefined) {
				createInput.agentConfig = body.agentConfig;
			}
			const result = await client.createAgent(userId, createInput);

			if (body.tokenAddress) {
				const deps = c.get("deps");
				try {
					await linkAgentToToken(deps, body.tokenAddress, result.agentId);
				} catch (linkErr) {
					c.get("logger").error({ error: linkErr }, "failed to link agent to token");
				}
			}

			return respondAccepted(c, result);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// GET /agents (authenticated)
	app.get("/", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const client = getMiladyClient();
		try {
			const userId = principalToUserId(auth);
			const agents = await client.getAgents(userId);
			return respondOk(c, agents);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// GET /agents/by-token/:tokenAddress (authenticated) — get agent linked to token
	app.get("/by-token/:tokenAddress", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const tokenAddress = c.req.param("tokenAddress");
		const deps = c.get("deps");
		const client = getMiladyClient();

		// Look up agent_id from token record
		const token = await deps.db.getTokenByAddress(tokenAddress);
		if (!token?.agentId) {
			return respondOk(c, null);
		}

		try {
			const userId = principalToUserId(auth);
			const agent = await client.getAgent(userId, token.agentId);
			return respondOk(c, {
				agentId: agent.agent_id,
				agentName: agent.agent_name,
				status: agent.status,
				containerUrl: agent.containerUrl,
				webUiUrl: agent.webUiUrl,
				tokenAddress,
				platforms: [],
			});
		} catch (err) {
			// If agent not found in milady-cloud, return status from DB
			if (err instanceof MiladyApiError && err.status === 404) {
				return respondOk(c, {
					agentId: token.agentId,
					agentName: token.name,
					status: token.agentStatus ?? "unknown",
					tokenAddress,
					platforms: [],
				});
			}
			handleMiladyError(err);
		}
	});

	// GET /agents/:agentId (authenticated)
	app.get("/:agentId", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const agentId = c.req.param("agentId");
		const client = getMiladyClient();
		try {
			const userId = principalToUserId(auth);
			const agent = await client.getAgent(userId, agentId);
			return respondOk(c, agent);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// GET /agents/:agentId/logs (authenticated)
	app.get("/:agentId/logs", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const agentId = c.req.param("agentId");
		const client = getMiladyClient();
		try {
			const userId = principalToUserId(auth);
			const logs = await client.getAgentLogs(userId, agentId);
			return respondOk(c, { logs });
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// POST /agents/:agentId/restart (authenticated)
	app.post("/:agentId/restart", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const agentId = c.req.param("agentId");
		const client = getMiladyClient();
		try {
			const userId = principalToUserId(auth);
			const result = await client.restartAgent(userId, agentId);
			return respondAccepted(c, result);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// POST /agents/:agentId/stop (authenticated) — stops agent container
	app.post("/:agentId/stop", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const agentId = c.req.param("agentId");
		const client = getMiladyClient();
		try {
			const userId = principalToUserId(auth);
			// milady-cloud doesn't distinguish stop vs delete — both remove the container
			const result = await client.deleteAgent(userId, agentId);
			return respondAccepted(c, result);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	// DELETE /agents/:agentId (authenticated)
	app.delete("/:agentId", requireAuth(), async (c) => {
		const auth = c.get("auth")!;
		const agentId = c.req.param("agentId");
		const client = getMiladyClient();
		try {
			const userId = principalToUserId(auth);
			const result = await client.deleteAgent(userId, agentId);
			return respondAccepted(c, result);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	return app;
}

// ─── Jobs routes (separate group) ─────────────────────────────────

export function createJobRoutes() {
	const app = new Hono<AppBindings>();

	// GET /jobs/:jobId (authenticated)
	app.get("/:jobId", requireAuth(), async (c) => {
		const jobId = c.req.param("jobId");
		const client = getMiladyClient();
		try {
			const job = await client.getJobStatus(jobId);
			return respondOk(c, job);
		} catch (err) {
			handleMiladyError(err);
		}
	});

	return app;
}
