import { type AgentEvent, agentEventQueries, agentPersonas, agentWallets, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

import { constantTimeEqual } from "../../lib/agent-keys.js";
import type { AppBindings } from "../../lib/bindings.js";
import { createElizaCloudClient, resolveElizaCloudApiKey } from "../../services/eliza-client.js";
import type { EmitAgentEventInput } from "../../services/events/emit.js";
import { dispatchEvent } from "../../services/webhook-consumer/index.js";

const app = new Hono<AppBindings>();
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type Db = ReturnType<typeof getDatabase>["db"];
type AdminAgentContext = Context<AppBindings>;
type PauseScope = "brain" | "withdrawals" | "full";

type AgentControlState = {
	agentId: string;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
};
type ProofStepState = "passed" | "failed" | "skipped";
type ProofStep = {
	key: string;
	state: ProofStepState;
	detail?: string;
	data?: unknown;
};

let testDbOverride: Db | null | undefined;

export function __setAdminAgentsDbForTest(db: Db | null | undefined) {
	testDbOverride = db;
}

function requireDrizzle(): Db | null {
	if (testDbOverride !== undefined) return testDbOverride;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function nonEmptyEnv(key: string): string | undefined {
	const value = process.env[key]?.trim();
	return value ? value : undefined;
}

function formatTimestamp(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

function serializeState(state: AgentControlState) {
	return {
		agentId: state.agentId,
		brainPaused: state.brainPausedAt !== null,
		brainPausedAt: formatTimestamp(state.brainPausedAt),
		brainPausedReason: state.brainPausedReason,
		withdrawalsPaused: state.withdrawalsPausedAt !== null,
		withdrawalsPausedAt: formatTimestamp(state.withdrawalsPausedAt),
		withdrawalsPausedReason: state.withdrawalsPausedReason,
		killed: state.killedAt !== null,
		killedAt: formatTimestamp(state.killedAt),
		killedReason: state.killedReason,
	};
}

async function readState(db: Db, agentId: string): Promise<AgentControlState | null> {
	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);

	return row ?? null;
}

async function emitAgentEvent(db: Db, agentId: string, type: string, payload: Record<string, unknown>) {
	await agentEventQueries.enqueueAgentEvent(db, {
		agentId,
		type,
		payload,
	});
}

async function parseReason(c: AdminAgentContext) {
	if (c.req.header("content-length") === "0") return null;

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return null;
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) return null;
	const reason = (body as { reason?: unknown }).reason;
	if (typeof reason !== "string") return null;
	const trimmed = reason.trim();
	return trimmed.length > 0 ? trimmed : null;
}

// OK: mounted exclusively at /v2/admin/agents. Do not mount this router on /v2/agents.
app.use("*", async (c, next) => {
	const authHeader = c.req.header("authorization");
	if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Admin bearer token required" }, 401);
	}

	const expected = process.env.ADMIN_API_KEY;
	const got = authHeader.slice(7).trim();
	if (!expected || expected.length === 0 || !constantTimeEqual(got, expected)) {
		return c.json({ ok: false, error: "FORBIDDEN", message: "Invalid admin bearer token" }, 403);
	}

	await next();
});

async function requireLiveAgent(db: Db, agentId: string) {
	const state = await readState(db, agentId);
	if (!state) return { response: new Response(null, { status: 404 }), state: null } as const;
	if (state.killedAt) return { response: new Response(null, { status: 409 }), state } as const;
	return { response: null, state } as const;
}

function notFoundResponse(agentId: string) {
	return Response.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, { status: 404 });
}

function killedResponse(agentId: string) {
	return Response.json(
		{ ok: false, error: "AGENT_KILLED", message: `agent ${agentId} is permanently killed` },
		{ status: 409 },
	);
}

async function pauseScopes(db: Db, agentId: string, scopes: PauseScope[], reason: string | null) {
	const now = new Date();
	const set: Partial<typeof agentPersonas.$inferInsert> = { updatedAt: now };

	if (scopes.includes("brain") || scopes.includes("full")) {
		set.brainPausedAt = now;
		set.brainPausedReason = reason;
	}
	if (scopes.includes("withdrawals") || scopes.includes("full")) {
		set.withdrawalsPausedAt = now;
		set.withdrawalsPausedReason = reason;
	}

	const [row] = await db.update(agentPersonas).set(set).where(eq(agentPersonas.agentId, agentId)).returning({
		agentId: agentPersonas.agentId,
		brainPausedAt: agentPersonas.brainPausedAt,
		brainPausedReason: agentPersonas.brainPausedReason,
		withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
		withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
		killedAt: agentPersonas.killedAt,
		killedReason: agentPersonas.killedReason,
	});

	if (!row) return null;

	const scope: PauseScope = scopes.includes("full") ? "full" : (scopes[0] ?? "full");
	await emitAgentEvent(db, agentId, "agent.paused", { scope, reason });
	return row;
}

async function resumeScopes(db: Db, agentId: string, scopes: PauseScope[]) {
	const set: Partial<typeof agentPersonas.$inferInsert> = { updatedAt: new Date() };

	if (scopes.includes("brain") || scopes.includes("full")) {
		set.brainPausedAt = null;
		set.brainPausedReason = null;
	}
	if (scopes.includes("withdrawals") || scopes.includes("full")) {
		set.withdrawalsPausedAt = null;
		set.withdrawalsPausedReason = null;
	}

	const [row] = await db.update(agentPersonas).set(set).where(eq(agentPersonas.agentId, agentId)).returning({
		agentId: agentPersonas.agentId,
		brainPausedAt: agentPersonas.brainPausedAt,
		brainPausedReason: agentPersonas.brainPausedReason,
		withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
		withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
		killedAt: agentPersonas.killedAt,
		killedReason: agentPersonas.killedReason,
	});

	if (!row) return null;

	const scope: PauseScope = scopes.includes("full") ? "full" : (scopes[0] ?? "full");
	await emitAgentEvent(db, agentId, "agent.resumed", { scope });
	return row;
}

async function withDb(c: AdminAgentContext) {
	const db = requireDrizzle();
	if (!db) {
		return { db: null, response: c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503) };
	}
	return { db, response: null };
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberField(data: Record<string, unknown>, key: string, fallback: number): number {
	const value = data[key];
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanField(data: Record<string, unknown>, key: string): boolean {
	return data[key] === true || data[key] === "true";
}

function recordField(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
	const value = data[key];
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringRecordField(data: Record<string, unknown>, key: string): Record<string, string> | null {
	const value = recordField(data, key);
	if (!value) return null;
	const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
	return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function proofStep(key: string, state: ProofStepState, detail?: string, data?: unknown): ProofStep {
	return { key, state, ...(detail ? { detail } : {}), ...(data !== undefined ? { data } : {}) };
}

function provisioningSourceField(
	value: string | null,
): "agent.bonded" | "agent.graduated" | "token.migrated" | "manual" {
	if (value === "agent.bonded" || value === "agent.graduated" || value === "token.migrated" || value === "manual") {
		return value;
	}
	return "agent.bonded";
}

function containerArchitectureField(data: Record<string, unknown>, key: string): "arm64" | "x86_64" | null {
	const value = stringField(data, key);
	if (value === "arm64" || value === "x86_64") return value;
	return null;
}

function directProvisionContainerInput(body: Record<string, unknown>) {
	const imageUri = stringField(body, "containerImageUri");
	const projectName = stringField(body, "containerProjectName") ?? stringField(body, "projectName");
	const port = numberField(body, "containerPort", Number.NaN);
	const cpu = numberField(body, "containerCpu", Number.NaN);
	const memory = numberField(body, "containerMemory", Number.NaN);
	const desiredCount = numberField(body, "containerDesiredCount", Number.NaN);
	const architecture = containerArchitectureField(body, "containerArchitecture");
	const healthCheckPath = stringField(body, "containerHealthCheckPath");
	const environmentVars =
		stringRecordField(body, "containerEnvironmentVars") ?? stringRecordField(body, "containerEnv");
	return {
		...(imageUri ? { imageUri } : {}),
		...(projectName ? { projectName } : {}),
		...(port > 0 ? { port } : {}),
		...(cpu > 0 ? { cpu } : {}),
		...(memory > 0 ? { memory } : {}),
		...(desiredCount > 0 ? { desiredCount } : {}),
		...(architecture ? { architecture } : {}),
		...(healthCheckPath ? { healthCheckPath } : {}),
		...(environmentVars ? { environmentVars } : {}),
	};
}

function workerProvisioningContainerData(body: Record<string, unknown>) {
	const imageUri = stringField(body, "containerImageUri");
	const projectName = stringField(body, "containerProjectName") ?? stringField(body, "projectName");
	const port = numberField(body, "containerPort", Number.NaN);
	const cpu = numberField(body, "containerCpu", Number.NaN);
	const memory = numberField(body, "containerMemory", Number.NaN);
	const desiredCount = numberField(body, "containerDesiredCount", Number.NaN);
	const architecture = containerArchitectureField(body, "containerArchitecture");
	const healthCheckPath = stringField(body, "containerHealthCheckPath");
	const environmentVars =
		stringRecordField(body, "containerEnvironmentVars") ?? stringRecordField(body, "containerEnv");
	return {
		...(imageUri ? { containerImageUri: imageUri } : {}),
		...(projectName ? { containerProjectName: projectName } : {}),
		...(port > 0 ? { containerPort: port } : {}),
		...(cpu > 0 ? { containerCpu: cpu } : {}),
		...(memory > 0 ? { containerMemory: memory } : {}),
		...(desiredCount > 0 ? { containerDesiredCount: desiredCount } : {}),
		...(architecture ? { containerArchitecture: architecture } : {}),
		...(healthCheckPath ? { containerHealthCheckPath: healthCheckPath } : {}),
		...(environmentVars ? { containerEnvironmentVars: environmentVars } : {}),
	};
}

function isElizaCloudTestEnabled(): boolean {
	return process.env.NODE_ENV !== "production" || process.env.WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE === "true";
}

function configuredElizaCloudClient() {
	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://api.elizacloud.ai";
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY;
	const apiKey = resolveElizaCloudApiKey();
	if (!serviceKey && !apiKey) return null;
	return createElizaCloudClient({
		baseUrl,
		...(serviceKey ? { serviceKey } : {}),
		...(apiKey ? { apiKey } : {}),
		logger: console,
	});
}

function getElizaCloudReadiness() {
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY;
	const apiKey = resolveElizaCloudApiKey();
	const imageUri = process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI;
	const chatSecret = process.env.WAIFU_CHAT_ACCESS_JWT_SECRET;
	const webhookUrl =
		nonEmptyEnv("ELIZA_CLOUD_WEBHOOK_URL") ??
		nonEmptyEnv("WAIFU_ELIZA_CLOUD_WEBHOOK_URL") ??
		(nonEmptyEnv("WAIFU_API_BASE_URL") || nonEmptyEnv("API_ORIGIN") || nonEmptyEnv("NEXT_PUBLIC_API_URL")
			? "derived"
			: undefined);
	const webhookSecret = process.env.ELIZA_CLOUD_WEBHOOK_SECRET ?? process.env.WEBHOOK_RECEIVER_SECRET;
	const databaseConfigured = testDbOverride !== undefined ? testDbOverride !== null : Boolean(process.env.DATABASE_URL);
	const testPageEnabled = isElizaCloudTestEnabled();
	const checks = {
		serviceAuth: Boolean(serviceKey || apiKey),
		containerImage: Boolean(imageUri),
		chatAccessSecret: Boolean(chatSecret),
		webhookUrl: Boolean(webhookUrl),
		webhookSecret: Boolean(webhookSecret),
		database: databaseConfigured,
		testPageEnabled,
	};
	return {
		ready: Object.values(checks).every(Boolean),
		baseUrl: process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://api.elizacloud.ai",
		checks,
		missing: Object.entries(checks)
			.filter(([, value]) => !value)
			.map(([key]) => key),
		productionGate: process.env.NODE_ENV === "production" ? "WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true" : null,
	};
}

async function readJsonObject(c: AdminAgentContext): Promise<Record<string, unknown> | Response> {
	try {
		const parsed = await c.req.json();
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
		return parsed as Record<string, unknown>;
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON", message: "JSON object body required" }, 400);
	}
}

app.get("/eliza-cloud/status", (c) => {
	return c.json({ ok: true, data: getElizaCloudReadiness() });
});

app.post("/eliza-cloud/test-provision", async (c) => {
	if (!isElizaCloudTestEnabled()) {
		return c.json(
			{
				ok: false,
				error: "TEST_PROVISION_DISABLED",
				message: "Set WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true to enable this production test endpoint.",
			},
			403,
		);
	}

	const body = await readJsonObject(c);
	if (body instanceof Response) return body;

	const tokenContractAddress = stringField(body, "tokenContractAddress");
	if (!tokenContractAddress || !EVM_ADDRESS_RE.test(tokenContractAddress)) {
		return c.json({ ok: false, error: "INVALID_TOKEN", message: "tokenContractAddress must be an EVM address" }, 400);
	}
	const agentEvmAddress = stringField(body, "agentEvmAddress");
	if (!agentEvmAddress || !EVM_ADDRESS_RE.test(agentEvmAddress)) {
		return c.json({ ok: false, error: "INVALID_AGENT_WALLET", message: "agentEvmAddress must be an EVM address" }, 400);
	}
	const adminWallet = stringField(body, "adminWallet");
	if (adminWallet && !EVM_ADDRESS_RE.test(adminWallet)) {
		return c.json({ ok: false, error: "INVALID_ADMIN_WALLET", message: "adminWallet must be an EVM address" }, 400);
	}

	const client = configuredElizaCloudClient();
	if (!client) {
		return c.json({ ok: false, error: "ELIZA_CLOUD_NOT_CONFIGURED", message: "Set ELIZA_CLOUD_SERVICE_KEY" }, 503);
	}

	try {
		const agentId = stringField(body, "agentId") ?? `waifu-test-${crypto.randomUUID().slice(0, 8)}`;
		const result = await client.provisionWaifuAgent?.({
			agentId,
			tokenContractAddress,
			chain: stringField(body, "chain") ?? "bsc",
			chainId: numberField(body, "chainId", 56),
			tokenName: stringField(body, "tokenName") ?? "Waifu Test Agent",
			tokenTicker: stringField(body, "tokenTicker") ?? "WTEST",
			launchType: "native",
			character: {
				name: stringField(body, "name") ?? stringField(body, "tokenName") ?? "Waifu Test Agent",
				...(stringField(body, "bio") ? { bio: stringField(body, "bio") as string } : {}),
				config: { testProvision: true, requestedAt: new Date().toISOString() },
			},
			billing: { mode: "owner_credits", initialReserveUsd: 5 },
			account: {
				primaryWalletAddress: agentEvmAddress,
				walletKeyRef: stringField(body, "walletKeyRef"),
			},
			access: {
				guestMinTokens: 1_000,
				userMinTokens: 100_000,
				adminWallets: adminWallet ? [adminWallet] : [],
			},
			container: directProvisionContainerInput(body),
		});
		return c.json({ ok: true, data: result });
	} catch (err) {
		return c.json(
			{
				ok: false,
				error: "ELIZA_CLOUD_PROVISION_FAILED",
				message: err instanceof Error ? err.message : String(err),
			},
			502,
		);
	}
});

app.post("/eliza-cloud/test-enqueue-provisioning", async (c) => {
	if (!isElizaCloudTestEnabled()) {
		return c.json(
			{
				ok: false,
				error: "TEST_PROVISION_DISABLED",
				message: "Set WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true to enable this production test endpoint.",
			},
			403,
		);
	}

	const body = await readJsonObject(c);
	if (body instanceof Response) return body;

	const agentId = stringField(body, "agentId");
	if (!agentId) return c.json({ ok: false, error: "AGENT_REQUIRED", message: "agentId is required" }, 400);

	const tokenContractAddress = stringField(body, "tokenContractAddress");
	if (!tokenContractAddress || !EVM_ADDRESS_RE.test(tokenContractAddress)) {
		return c.json({ ok: false, error: "INVALID_TOKEN", message: "tokenContractAddress must be an EVM address" }, 400);
	}
	const agentEvmAddress = stringField(body, "agentEvmAddress");
	if (agentEvmAddress && !EVM_ADDRESS_RE.test(agentEvmAddress)) {
		return c.json({ ok: false, error: "INVALID_AGENT_WALLET", message: "agentEvmAddress must be an EVM address" }, 400);
	}
	const adminWallet = stringField(body, "adminWallet");
	if (adminWallet && !EVM_ADDRESS_RE.test(adminWallet)) {
		return c.json({ ok: false, error: "INVALID_ADMIN_WALLET", message: "adminWallet must be an EVM address" }, 400);
	}

	const source = provisioningSourceField(stringField(body, "source"));
	const chain = stringField(body, "chain") ?? "bsc";
	const chainId = numberField(body, "chainId", 56);
	const payload = {
		agentId,
		source,
		data: {
			tokenContractAddress,
			tokenAddress: tokenContractAddress,
			chain,
			chainId,
			tokenName: stringField(body, "tokenName") ?? stringField(body, "name") ?? "Waifu Test Agent",
			tokenTicker: stringField(body, "tokenTicker") ?? "WTEST",
			launchType: "native",
			...(agentEvmAddress ? { agentWalletAddress: agentEvmAddress } : {}),
			...(stringField(body, "walletKeyRef") ? { walletKeyRef: stringField(body, "walletKeyRef") } : {}),
			...(adminWallet ? { adminWallets: [adminWallet] } : {}),
			...workerProvisioningContainerData(body),
			...(numberField(body, "initialReserveUsd", Number.NaN) > 0
				? { initialReserveUsd: numberField(body, "initialReserveUsd", 5) }
				: {}),
		},
	};
	const jobId = stringField(body, "jobId") ?? `admin-${source}-${agentId}-${Date.now()}`;
	const dryRun = booleanField(body, "dryRun");
	if (!dryRun) {
		const { db, response } = await withDb(c);
		if (!db) return response;
		const preflight = await preflightWorkerProvisioningAgent(c, db, agentId, agentEvmAddress);
		if (preflight) return preflight;

		const { addAgentProvisioningJob } = await import("@waifufun/queue");
		await addAgentProvisioningJob(payload, { jobId });
	}
	return c.json({ ok: true, data: { enqueued: !dryRun, dryRun, jobId, payload } });
});

app.post("/eliza-cloud/test-proof", async (c) => {
	if (!isElizaCloudTestEnabled()) {
		return c.json(
			{
				ok: false,
				error: "TEST_PROVISION_DISABLED",
				message: "Set WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true to enable this production test endpoint.",
			},
			403,
		);
	}

	const body = await readJsonObject(c);
	if (body instanceof Response) return body;

	const steps: ProofStep[] = [];
	const readiness = getElizaCloudReadiness();
	steps.push(
		proofStep(
			"readiness",
			readiness.ready ? "passed" : "failed",
			readiness.ready ? "Eliza Cloud admin config is ready" : `missing: ${readiness.missing.join(", ") || "unknown"}`,
			readiness,
		),
	);

	const agentId = stringField(body, "agentId");
	if (!agentId)
		return c.json({ ok: false, error: "AGENT_REQUIRED", message: "agentId is required", data: { steps } }, 400);
	const tokenContractAddress = stringField(body, "tokenContractAddress");
	if (!tokenContractAddress || !EVM_ADDRESS_RE.test(tokenContractAddress)) {
		return c.json(
			{ ok: false, error: "INVALID_TOKEN", message: "tokenContractAddress must be an EVM address", data: { steps } },
			400,
		);
	}
	const agentEvmAddress = stringField(body, "agentEvmAddress");
	if (agentEvmAddress && !EVM_ADDRESS_RE.test(agentEvmAddress)) {
		return c.json(
			{ ok: false, error: "INVALID_AGENT_WALLET", message: "agentEvmAddress must be an EVM address", data: { steps } },
			400,
		);
	}
	const adminWallet = stringField(body, "adminWallet");
	if (adminWallet && !EVM_ADDRESS_RE.test(adminWallet)) {
		return c.json(
			{ ok: false, error: "INVALID_ADMIN_WALLET", message: "adminWallet must be an EVM address", data: { steps } },
			400,
		);
	}

	const source = provisioningSourceField(stringField(body, "source"));
	const chain = stringField(body, "chain") ?? "bsc";
	const chainId = numberField(body, "chainId", 56);
	const payload = {
		agentId,
		source,
		data: {
			tokenContractAddress,
			tokenAddress: tokenContractAddress,
			chain,
			chainId,
			tokenName: stringField(body, "tokenName") ?? stringField(body, "name") ?? "Waifu Test Agent",
			tokenTicker: stringField(body, "tokenTicker") ?? "WTEST",
			launchType: "native",
			...(agentEvmAddress ? { agentWalletAddress: agentEvmAddress } : {}),
			...(stringField(body, "walletKeyRef") ? { walletKeyRef: stringField(body, "walletKeyRef") } : {}),
			...(adminWallet ? { adminWallets: [adminWallet] } : {}),
			...workerProvisioningContainerData(body),
			...(numberField(body, "initialReserveUsd", Number.NaN) > 0
				? { initialReserveUsd: numberField(body, "initialReserveUsd", 5) }
				: {}),
		},
	};
	const dryRun = booleanField(body, "dryRun");
	const jobId = stringField(body, "jobId") ?? `admin-proof-${source}-${agentId}-${Date.now()}`;
	const { db, response } = await withDb(c);
	if (!db) return response;

	if (!dryRun && !readiness.ready) {
		return c.json(
			{
				ok: false,
				error: "ELIZA_CLOUD_NOT_READY",
				message: "Eliza Cloud admin config must be ready before enqueueing real worker provisioning",
				data: { ready: false, dryRun, jobId, steps },
			},
			503,
		);
	}

	if (!dryRun) {
		const preflight = await preflightWorkerProvisioningAgent(c, db, agentId, agentEvmAddress);
		if (preflight) return preflight;
		const { addAgentProvisioningJob } = await import("@waifufun/queue");
		await addAgentProvisioningJob(payload, { jobId });
	}
	steps.push(
		proofStep(
			"agent.bonded",
			dryRun ? "skipped" : "passed",
			dryRun ? "validated bonded worker payload without enqueueing" : `enqueued ${jobId}`,
			{ jobId, payload },
		),
	);

	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			elizaCloudAgentId: agentPersonas.elizaCloudAgentId,
			metadata: agentPersonas.metadata,
			runtimeKind: agentPersonas.runtimeKind,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	if (!row) {
		steps.push(proofStep("runtime", "skipped", `agent ${agentId} not found after worker payload validation`));
		return c.json({ ok: true, data: { ready: false, dryRun, jobId, steps } });
	}

	const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
	const provisioning = recordField(metadata, "provisioning") ?? {};
	const cloudAgentId =
		row.elizaCloudAgentId ??
		stringField(provisioning, "cloudAgentId") ??
		stringField(provisioning, "runtimeAgentId") ??
		null;
	const runtimeRef = {
		agentId,
		cloudAgentId,
		containerId: stringField(provisioning, "containerId"),
		containerUrl: stringField(provisioning, "containerUrl"),
		webUiUrl: stringField(provisioning, "webUiUrl"),
		status: stringField(provisioning, "status"),
		account: recordField(provisioning, "account"),
		walletProvisioning: recordField(provisioning, "walletProvisioning"),
		polling: recordField(provisioning, "polling"),
	};
	steps.push(
		proofStep(
			"runtime",
			cloudAgentId && runtimeRef.webUiUrl ? "passed" : "skipped",
			cloudAgentId && runtimeRef.webUiUrl
				? "hosted runtime metadata includes webUiUrl"
				: "worker runtime not hosted yet",
			runtimeRef,
		),
	);

	const client = configuredElizaCloudClient();
	if (cloudAgentId && client?.getAgentRuntimeStatus) {
		const status = await client.getAgentRuntimeStatus(cloudAgentId);
		steps.push(
			proofStep(
				"runtime-status",
				status.webUiUrl ? "passed" : "failed",
				status.webUiUrl ?? "no hosted webUiUrl",
				status,
			),
		);
	} else {
		steps.push(proofStep("runtime-status", "skipped", "cloud agent id or status API unavailable"));
	}

	const getCreditBalance = client?.getCreditBalance ?? client?.getAppCreditBalance;
	if (cloudAgentId && getCreditBalance) {
		const balance = await getCreditBalance.call(client, cloudAgentId);
		steps.push(proofStep("credits", "passed", "credit balance API returned", balance));
	} else {
		steps.push(proofStep("credits", "skipped", "cloud agent id or credit API unavailable"));
	}

	if (!dryRun && booleanField(body, "verifyLifecycle") && cloudAgentId && client) {
		const containerId = runtimeRef.containerId ?? undefined;
		for (const action of ["webhook-depleted", "webhook-topped-up"] as const) {
			const event =
				action === "webhook-depleted"
					? { event: "agent.credits.depleted", data: { creditsRemaining: 0 } }
					: {
							event: "credits.topped_up",
							data: {
								amountUsdCents: numberField(body, "amountUsdCents", 500),
								sessionId: stringField(body, "sessionId"),
							},
						};
			await dispatchEvent(
				{
					event: event.event,
					timestamp: new Date().toISOString(),
					agentId,
					idempotencyKey: `admin-eliza-cloud:test-proof:${action}:${cloudAgentId}:${Date.now()}`,
					data: {
						...event.data,
						agentId,
						cloudAgentId,
						elizaCloudAgentId: cloudAgentId,
						...(containerId ? { containerId } : {}),
						source: "admin-eliza-cloud-test-proof",
					},
				},
				{
					db,
					elizaCloud: client,
					logger: console,
					personaStore: adminPersonaStore(db),
					emitEvent: adminEmitEvent(db),
					getXClient: async () => null,
				},
			);
			steps.push(proofStep(action, "passed", "lifecycle webhook dispatch completed"));
		}
	} else if (dryRun && booleanField(body, "verifyLifecycle")) {
		steps.push(
			proofStep(
				"lifecycle",
				"skipped",
				"verifyLifecycle does not run under dryRun (it dispatches real credits.depleted/topped_up webhooks to the live agent)",
			),
		);
	} else {
		steps.push(proofStep("lifecycle", "skipped", "set verifyLifecycle=true after runtime exists"));
	}

	const failed = steps.some((step) => step.state === "failed");
	return c.json({ ok: true, data: { ready: !failed, dryRun, jobId, steps } });
});

async function preflightWorkerProvisioningAgent(
	c: AdminAgentContext,
	db: Db,
	agentId: string,
	payloadWalletAddress: string | null,
): Promise<Response | null> {
	const [persona] = await db
		.select({ agentId: agentPersonas.agentId })
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	if (!persona) {
		return c.json(
			{
				ok: false,
				error: "AGENT_NOT_FOUND",
				message: `agent ${agentId} must exist before enqueueing real Eliza Cloud worker provisioning`,
			},
			404,
		);
	}

	if (payloadWalletAddress) return null;

	const [wallet] = await db
		.select({ walletAddress: agentWallets.walletAddress })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, agentId))
		.limit(1);
	if (!wallet?.walletAddress || !EVM_ADDRESS_RE.test(wallet.walletAddress)) {
		return c.json(
			{
				ok: false,
				error: "AGENT_WALLET_NOT_READY",
				message:
					"agentWalletAddress must be provided or the existing agent must have a valid EVM wallet before real worker provisioning",
			},
			409,
		);
	}

	return null;
}

app.get("/eliza-cloud/test-runtime-ref", async (c) => {
	if (!isElizaCloudTestEnabled()) {
		return c.json(
			{
				ok: false,
				error: "TEST_PROVISION_DISABLED",
				message: "Set WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true to enable this production test endpoint.",
			},
			403,
		);
	}

	const agentId = c.req.query("agentId")?.trim();
	if (!agentId) return c.json({ ok: false, error: "AGENT_REQUIRED", message: "agentId is required" }, 400);

	const { db, response } = await withDb(c);
	if (!db) return response;
	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			elizaCloudAgentId: agentPersonas.elizaCloudAgentId,
			metadata: agentPersonas.metadata,
			runtimeKind: agentPersonas.runtimeKind,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	if (!row) return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, 404);

	const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
	const provisioning = recordField(metadata, "provisioning") ?? {};
	const cloudAgentId =
		row.elizaCloudAgentId ??
		stringField(provisioning, "cloudAgentId") ??
		stringField(provisioning, "runtimeAgentId") ??
		null;
	if (!cloudAgentId) {
		return c.json(
			{
				ok: false,
				error: "RUNTIME_NOT_READY",
				message: `agent ${agentId} does not have Eliza Cloud runtime metadata yet`,
				data: { agentId, runtimeKind: row.runtimeKind, provisioning },
			},
			409,
		);
	}

	return c.json({
		ok: true,
		data: {
			agentId,
			cloudAgentId,
			containerId: stringField(provisioning, "containerId"),
			containerUrl: stringField(provisioning, "containerUrl"),
			webUiUrl: stringField(provisioning, "webUiUrl"),
			status: stringField(provisioning, "status"),
			account: recordField(provisioning, "account"),
			walletProvisioning: recordField(provisioning, "walletProvisioning"),
			polling: recordField(provisioning, "polling"),
		},
	});
});

app.post("/eliza-cloud/test-control", async (c) => {
	if (!isElizaCloudTestEnabled()) {
		return c.json(
			{
				ok: false,
				error: "TEST_PROVISION_DISABLED",
				message: "Set WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE=true to enable this production test endpoint.",
			},
			403,
		);
	}

	const body = await readJsonObject(c);
	if (body instanceof Response) return body;
	const action = stringField(body, "action");
	const containerId = stringField(body, "containerId");
	const cloudAgentId = stringField(body, "cloudAgentId");
	const sessionId = stringField(body, "sessionId");
	const agentId = stringField(body, "agentId");
	const amountUsdCents = numberField(body, "amountUsdCents", 500);

	const client = configuredElizaCloudClient();
	if (!client) {
		return c.json({ ok: false, error: "ELIZA_CLOUD_NOT_CONFIGURED", message: "Set ELIZA_CLOUD_SERVICE_KEY" }, 503);
	}

	try {
		if (action === "pause") {
			const runtimeId = cloudAgentId ?? containerId;
			if (!runtimeId)
				return c.json({ ok: false, error: "RUNTIME_REQUIRED", message: "cloudAgentId or containerId required" }, 400);
			const result = await client.pauseAgent(runtimeId);
			return c.json({ ok: true, data: { action, cloudAgentId: runtimeId, result } });
		}
		if (action === "resume") {
			const runtimeId = cloudAgentId ?? containerId;
			if (!runtimeId)
				return c.json({ ok: false, error: "RUNTIME_REQUIRED", message: "cloudAgentId or containerId required" }, 400);
			const result = await client.resumeAgent(runtimeId);
			return c.json({ ok: true, data: { action, cloudAgentId: runtimeId, result } });
		}
		if (action === "restart") {
			const runtimeId = cloudAgentId ?? containerId;
			if (!runtimeId)
				return c.json({ ok: false, error: "RUNTIME_REQUIRED", message: "cloudAgentId or containerId required" }, 400);
			const result = client.restartHostedAgent
				? await client.restartHostedAgent(runtimeId)
				: {
						pause: await client.pauseAgent(runtimeId),
						resume: await client.resumeAgent(runtimeId),
					};
			return c.json({
				ok: true,
				data: { action, cloudAgentId: runtimeId, result },
			});
		}
		if (action === "status") {
			const runtimeId = cloudAgentId ?? containerId;
			if (!runtimeId)
				return c.json({ ok: false, error: "RUNTIME_REQUIRED", message: "cloudAgentId or containerId required" }, 400);
			if (!client.getAgentRuntimeStatus) {
				return c.json({ ok: false, error: "UNSUPPORTED_ACTION", message: "agent runtime status is unavailable" }, 400);
			}
			const status = await client.getAgentRuntimeStatus(runtimeId);
			return c.json({ ok: true, data: { action, cloudAgentId: runtimeId, status } });
		}
		if (action === "top-up") {
			if (!cloudAgentId) {
				return c.json({ ok: false, error: "CLOUD_AGENT_REQUIRED", message: "cloudAgentId required" }, 400);
			}
			if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
				return c.json({ ok: false, error: "INVALID_AMOUNT", message: "amountUsdCents must be positive" }, 400);
			}
			const checkout = await client.topUpCredits(cloudAgentId, amountUsdCents / 100);
			return c.json({ ok: true, data: { action, cloudAgentId, amountUsdCents, checkout } });
		}
		if (action === "balance") {
			if (!cloudAgentId && !client.getCreditBalance) {
				return c.json({ ok: false, error: "CLOUD_AGENT_REQUIRED", message: "cloudAgentId required" }, 400);
			}
			if (!client.getCreditBalance && !client.getAppCreditBalance) {
				return c.json({ ok: false, error: "UNSUPPORTED_ACTION", message: "credit balance is unavailable" }, 400);
			}
			const balance = client.getCreditBalance
				? await client.getCreditBalance(cloudAgentId ?? undefined)
				: await client.getAppCreditBalance?.(cloudAgentId as string);
			return c.json({ ok: true, data: { action, cloudAgentId, balance } });
		}
		if (action === "verify-top-up") {
			if (!sessionId) return c.json({ ok: false, error: "SESSION_REQUIRED", message: "sessionId required" }, 400);
			if (!client.verifyCreditCheckout && !client.verifyAppCreditCheckout) {
				return c.json({ ok: false, error: "UNSUPPORTED_ACTION", message: "credit verification is unavailable" }, 400);
			}
			const verification = client.verifyCreditCheckout
				? await client.verifyCreditCheckout(sessionId)
				: await client.verifyAppCreditCheckout?.(sessionId);
			const balance =
				cloudAgentId && client.getCreditBalance
					? await client.getCreditBalance(cloudAgentId)
					: cloudAgentId && client.getAppCreditBalance
						? await client.getAppCreditBalance(cloudAgentId)
						: undefined;
			const status =
				cloudAgentId && client.getAgentRuntimeStatus ? await client.getAgentRuntimeStatus(cloudAgentId) : undefined;
			return c.json({ ok: true, data: { action, cloudAgentId, sessionId, verification, balance, status } });
		}
		if (action === "webhook-depleted" || action === "webhook-topped-up") {
			const runtimeId = cloudAgentId ?? containerId;
			if (!runtimeId)
				return c.json({ ok: false, error: "RUNTIME_REQUIRED", message: "cloudAgentId or containerId required" }, 400);
			const { db, response } = await withDb(c);
			if (!db) return response;
			const resolvedAgentId =
				agentId ?? (cloudAgentId ? await resolveAgentIdForElizaCloudRuntime(db, cloudAgentId) : null);
			if (!resolvedAgentId) {
				return c.json(
					{
						ok: false,
						error: "AGENT_REQUIRED",
						message: "agentId is required when no agent can be resolved from cloudAgentId",
					},
					400,
				);
			}
			const event =
				action === "webhook-depleted"
					? { event: "agent.credits.depleted", data: { creditsRemaining: 0 } }
					: { event: "credits.topped_up", data: { amountUsdCents, sessionId } };
			await dispatchEvent(
				{
					event: event.event,
					timestamp: new Date().toISOString(),
					agentId: resolvedAgentId,
					idempotencyKey: `admin-eliza-cloud:${action}:${runtimeId}:${Date.now()}`,
					data: {
						...event.data,
						agentId: resolvedAgentId,
						cloudAgentId: runtimeId,
						elizaCloudAgentId: runtimeId,
						...(containerId ? { containerId } : {}),
						source: "admin-eliza-cloud-test",
					},
				},
				{
					db,
					elizaCloud: client,
					logger: console,
					personaStore: adminPersonaStore(db),
					emitEvent: adminEmitEvent(db),
					getXClient: async () => null,
				},
			);
			const status = client.getAgentRuntimeStatus
				? await client.getAgentRuntimeStatus(runtimeId).catch(() => undefined)
				: undefined;
			return c.json({ ok: true, data: { action, agentId: resolvedAgentId, cloudAgentId: runtimeId, status } });
		}
		return c.json(
			{
				ok: false,
				error: "INVALID_ACTION",
				message:
					"action must be pause, resume, restart, status, top-up, balance, verify-top-up, webhook-depleted, or webhook-topped-up",
			},
			400,
		);
	} catch (err) {
		return c.json(
			{
				ok: false,
				error: "ELIZA_CLOUD_CONTROL_FAILED",
				message: err instanceof Error ? err.message : String(err),
			},
			502,
		);
	}
});

async function resolveAgentIdForElizaCloudRuntime(db: Db, cloudAgentId: string): Promise<string | null> {
	const [row] = await db
		.select({ agentId: agentPersonas.agentId })
		.from(agentPersonas)
		.where(eq(agentPersonas.elizaCloudAgentId, cloudAgentId))
		.limit(1);
	return row?.agentId ?? null;
}

function adminPersonaStore(db: Db) {
	return {
		async get(agentId: string) {
			const [row] = await db
				.select({
					agentId: agentPersonas.agentId,
					modelTier: agentPersonas.modelTier,
					lastWordsPostedAt: agentPersonas.lastWordsPostedAt,
				})
				.from(agentPersonas)
				.where(eq(agentPersonas.agentId, agentId))
				.limit(1);
			return row ?? null;
		},
		async setModelTier(agentId: string, tier: "premium" | "standard" | "free") {
			await db
				.update(agentPersonas)
				.set({ modelTier: tier, updatedAt: new Date() })
				.where(eq(agentPersonas.agentId, agentId));
		},
		async markLastWordsPosted(agentId: string, now: Date) {
			await db
				.update(agentPersonas)
				.set({ lastWordsPostedAt: now, updatedAt: now })
				.where(eq(agentPersonas.agentId, agentId));
		},
		async markDormant(agentId: string, now: Date) {
			await db
				.update(agentPersonas)
				.set({
					dormantAt: now,
					brainPausedAt: now,
					brainPausedReason: "credits_depleted",
					updatedAt: now,
				})
				.where(eq(agentPersonas.agentId, agentId));
		},
	};
}

function adminEmitEvent(db: Db) {
	return async (input: EmitAgentEventInput) => {
		if (!input.agentId) throw new Error("agentId is required for admin Eliza Cloud lifecycle events");
		const event = await agentEventQueries.enqueueAgentEvent(db, {
			agentId: input.agentId,
			type: input.eventType,
			payload: input.data ?? {},
		});
		return event as AgentEvent;
	};
}

app.post("/:agentId/brain/pause", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const reason = await parseReason(c);
	const state = await pauseScopes(db, agentId, ["brain"], reason);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/brain/resume", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const state = await resumeScopes(db, agentId, ["brain"]);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/withdrawals/pause", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const reason = await parseReason(c);
	const state = await pauseScopes(db, agentId, ["withdrawals"], reason);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/withdrawals/resume", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const state = await resumeScopes(db, agentId, ["withdrawals"]);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/pause", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const reason = await parseReason(c);
	const state = await pauseScopes(db, agentId, ["full"], reason);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/resume", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const state = await resumeScopes(db, agentId, ["full"]);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/kill", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const existing = await readState(db, agentId);
	if (!existing) return notFoundResponse(agentId);
	if (existing.killedAt) {
		return c.json({ ok: false, error: "AGENT_ALREADY_KILLED", message: `agent ${agentId} is already killed` }, 409);
	}

	const reason = await parseReason(c);
	const now = new Date();
	const [state] = await db
		.update(agentPersonas)
		.set({
			brainPausedAt: now,
			brainPausedReason: reason,
			withdrawalsPausedAt: now,
			withdrawalsPausedReason: reason,
			killedAt: now,
			killedReason: reason,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId))
		.returning({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		});

	await emitAgentEvent(db, agentId, "agent.killed", { reason });
	return c.json({ ok: true, data: serializeState(state ?? existing) });
});

app.get("/:agentId/state", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const state = await readState(db, agentId);
	if (!state) return notFoundResponse(agentId);
	return c.json({ ok: true, data: serializeState(state) });
});

export default app;
