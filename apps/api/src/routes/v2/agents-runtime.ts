import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { agentPersonas, getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { generateRuntimeApiKey, hashRuntimeApiKey } from "../../middleware/agent-pull-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import { type ElizaCloudClient, createElizaCloudClient, resolveElizaCloudApiKey } from "../../services/eliza-client.js";
import { getAgentRuntimeState } from "../../services/provisioning.js";

export type AgentRuntimeState = {
	state: "pending" | "provisioning" | "live" | "failed" | "dormant";
	cloudAgentId?: string;
	runtimeAgentId?: string;
	containerId?: string;
	containerUrl?: string;
	webUiUrl?: string;
	lastEventAt?: string;
	lastError?: string;
};

export function createAgentRuntimeRoutes(
	options: {
		db?: Database;
		getRuntimeState?: (db: Database, agentId: string) => Promise<AgentRuntimeState | null>;
		elizaClient?: Pick<ElizaCloudClient, "getAgentRuntimeStatus" | "pauseAgent" | "resumeAgent" | "restartHostedAgent">;
	} = {},
) {
	const app = new Hono();

	app.get("/:id/runtime", requirePatron(), requireAgentOwnership("id"), async (c) => {
		const agentId = c.req.param("id");
		if (!agentId || agentId.length > 128) {
			return c.json({ error: "invalid agent id" }, 400);
		}

		const db = options.db ?? requireDb();
		if (!db) return c.json({ error: "database unavailable" }, 503);

		try {
			const state = await (options.getRuntimeState ?? getAgentRuntimeState)(db, agentId);
			if (!state) return c.json({ error: "agent not found" }, 404);
			return c.json(state);
		} catch (err) {
			return c.json(
				{
					error: "failed to load runtime state",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}
	});

	app.put("/:id/runtime", requirePatron(), requireAgentOwnership("id"), async (c) => {
		const agentId = c.req.param("id");
		const db = options.db ?? requireDb();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);

		const body = recordFromUnknown(await c.req.json().catch(() => ({})));
		const action = stringField(body, "action") ?? stringField(body, "desiredState") ?? stringField(body, "state");
		if (!action) {
			return c.json(
				{
					ok: false,
					error: "ACTION_REQUIRED",
					message: "set action to suspend, resume, restart, or status",
				},
				400,
			);
		}

		const state: AgentRuntimeState | null = await (options.getRuntimeState ?? getAgentRuntimeState)(db, agentId);
		if (!state) return c.json({ ok: false, error: "NOT_FOUND", message: "agent not found" }, 404);
		const cloudAgentId = runtimeControlId(state);
		if (!cloudAgentId) {
			return c.json(
				{
					ok: false,
					error: "RUNTIME_NOT_PROVISIONED",
					message: "agent does not have Eliza Cloud runtime metadata yet",
					runtime: state,
				},
				409,
			);
		}

		const client = options.elizaClient ?? createDefaultElizaCloudClient();
		try {
			const normalized = action.toLowerCase();
			let controlResult: unknown = null;
			if (normalized === "suspend" || normalized === "pause" || normalized === "dormant") {
				controlResult = await client.pauseAgent(cloudAgentId);
			} else if (normalized === "resume" || normalized === "start" || normalized === "running") {
				controlResult = await client.resumeAgent(cloudAgentId);
			} else if (normalized === "restart") {
				if (client.restartHostedAgent) controlResult = await client.restartHostedAgent(cloudAgentId);
				else {
					await client.pauseAgent(cloudAgentId);
					controlResult = await client.resumeAgent(cloudAgentId);
				}
			} else if (normalized !== "status") {
				return c.json(
					{
						ok: false,
						error: "UNSUPPORTED_ACTION",
						message: "supported actions are suspend, resume, restart, and status",
					},
					400,
				);
			}

			const status = client.getAgentRuntimeStatus
				? await client.getAgentRuntimeStatus(cloudAgentId).catch(() => null)
				: null;
			return c.json({ ok: true, action: normalized, cloudAgentId, result: controlResult, status, runtime: state });
		} catch (err) {
			return c.json(
				{
					ok: false,
					error: "RUNTIME_CONTROL_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
				502,
			);
		}
	});

	app.post("/:id/runtime/test", requirePatron(), requireAgentOwnership("id"), async (c) => {
		const agentId = c.req.param("id");
		const db = options.db ?? requireDb();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);

		const state: AgentRuntimeState | null = await (options.getRuntimeState ?? getAgentRuntimeState)(db, agentId);
		if (!state) return c.json({ ok: false, error: "NOT_FOUND", message: "agent not found" }, 404);
		const cloudAgentId = runtimeControlId(state);
		if (!cloudAgentId) {
			return c.json(
				{
					ok: false,
					error: "RUNTIME_NOT_PROVISIONED",
					message: "agent does not have Eliza Cloud runtime metadata yet",
					runtime: state,
				},
				409,
			);
		}

		const client = options.elizaClient ?? createDefaultElizaCloudClient();
		if (!client.getAgentRuntimeStatus) {
			return c.json(
				{ ok: false, error: "STATUS_UNAVAILABLE", message: "Eliza Cloud status API is not configured" },
				503,
			);
		}
		const status = await client.getAgentRuntimeStatus(cloudAgentId);
		const webUiUrl = status.webUiUrl ?? status.containerUrl ?? state.webUiUrl ?? state.containerUrl ?? null;
		return c.json({
			ok: isHostedRuntimeRunning(status.status),
			cloudAgentId,
			status,
			webUiUrl,
			running: isHostedRuntimeRunning(status.status),
			hasWebUiUrl: Boolean(webUiUrl),
		});
	});

	app.post("/:id/runtime/rotate-key", requirePatron(), requireAgentOwnership("id"), async (c) => {
		const ownership = c.get("patronAgent");
		const db = options.db ?? requireDb();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);

		const runtimeApiKey = generateRuntimeApiKey();
		await db
			.update(agentPersonas)
			.set({ runtimeApiKeyHash: hashRuntimeApiKey(runtimeApiKey), updatedAt: new Date() })
			.where(eq(agentPersonas.id, ownership.id));
		return c.json({
			ok: true,
			agentId: ownership.agentId,
			runtimeApiKey,
			message: "Store this value now; waifu.fun only stores its hash.",
		});
	});

	return app;
}

function runtimeControlId(state: AgentRuntimeState): string | null {
	return state.cloudAgentId ?? state.runtimeAgentId ?? state.containerId ?? null;
}

function isHostedRuntimeRunning(status: string | null | undefined): boolean {
	return ["running", "ready", "online", "active", "started"].includes(String(status ?? "").toLowerCase());
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
	const raw = value[key];
	return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function createDefaultElizaCloudClient(): ElizaCloudClient {
	const apiKey = resolveElizaCloudApiKey();
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY;
	return createElizaCloudClient({
		baseUrl: process.env.ELIZA_CLOUD_API_URL ?? process.env.ELIZAOS_CLOUD_API_URL ?? "https://api.elizacloud.ai",
		...(apiKey ? { apiKey } : {}),
		...(serviceKey ? { serviceKey } : {}),
		logger: console,
	});
}

function requireDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export default createAgentRuntimeRoutes();
