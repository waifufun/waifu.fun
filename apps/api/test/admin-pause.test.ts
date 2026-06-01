import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import adminAgentRoutes, { __setAdminAgentsDbForTest } from "../src/routes/v2/admin-agents.ts";

const ADMIN_KEY = "test-admin-key";
const AGENT_ID = "waifu-test-agent";

type ControlRow = {
	agentId: string;
	modelTier?: "premium" | "standard" | "free" | null;
	lastWordsPostedAt?: Date | null;
	dormantAt?: Date | null;
	tokenAddress?: string | null;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
	elizaCloudAgentId?: string | null;
	metadata?: unknown;
	runtimeKind?: string | null;
	updatedAt: Date;
};

function freshRow(): ControlRow {
	return {
		agentId: AGENT_ID,
		modelTier: "premium",
		lastWordsPostedAt: null,
		dormantAt: null,
		tokenAddress: null,
		brainPausedAt: null,
		brainPausedReason: null,
		withdrawalsPausedAt: null,
		withdrawalsPausedReason: null,
		killedAt: null,
		killedReason: null,
		elizaCloudAgentId: null,
		metadata: null,
		runtimeKind: null,
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	};
}

function createFakeDb(initial: ControlRow | null = freshRow()) {
	let row = initial;
	const events: Array<Record<string, unknown>> = [];

	const db = {
		select() {
			return {
				from() {
					return this;
				},
				where() {
					return this;
				},
				limit() {
					return row ? [{ ...row }] : [];
				},
			};
		},
		update() {
			let patch: Partial<ControlRow> = {};
			return {
				set(next: Partial<ControlRow>) {
					patch = next;
					return this;
				},
				where() {
					return this;
				},
				returning() {
					if (!row) return [];
					row = { ...row, ...patch };
					return [{ ...row }];
				},
			};
		},
		insert() {
			return {
				values(value: Record<string, unknown>) {
					return {
						returning() {
							const event = {
								id: `event-${events.length + 1}`,
								...value,
								status: "pending",
								attempts: 0,
								errorMessage: null,
								createdAt: new Date(),
								processedAt: null,
							};
							events.push(event);
							return [event];
						},
					};
				},
			};
		},
	};

	return {
		db,
		events,
		row: () => row,
	};
}

async function request(path: string, init: RequestInit & { admin?: boolean; wrongAdmin?: boolean } = {}) {
	const headers = new Headers(init.headers);
	if (init.admin) headers.set("authorization", `Bearer ${ADMIN_KEY}`);
	if (init.wrongAdmin) headers.set("authorization", "Bearer nope");
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

	return adminAgentRoutes.fetch(
		new Request(`http://unit.test${path}`, {
			...init,
			headers,
		}),
	);
}

async function json(res: Response) {
	return (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: string };
}

describe("v2 admin agent pause controls", () => {
	beforeEach(() => {
		delete process.env.ELIZA_CLOUD_BASE_URL;
		delete process.env.ELIZA_CLOUD_SERVICE_KEY;
		delete process.env.ELIZA_CLOUD_API_KEY;
		delete process.env.ELIZAOS_CLOUD_API_KEY;
		delete process.env.ELIZAOS_API_KEY;
		delete process.env.ELIZACLOUD_API_KEY;
		delete process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI;
		delete process.env.WAIFU_CHAT_ACCESS_JWT_SECRET;
		delete process.env.WAIFU_API_BASE_URL;
		delete process.env.API_ORIGIN;
		delete process.env.NEXT_PUBLIC_API_URL;
		delete process.env.ELIZA_CLOUD_WEBHOOK_URL;
		delete process.env.WAIFU_ELIZA_CLOUD_WEBHOOK_URL;
		delete process.env.ELIZA_CLOUD_WEBHOOK_SECRET;
		delete process.env.WEBHOOK_RECEIVER_SECRET;
		delete process.env.WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE;
		delete process.env.DATABASE_URL;
		process.env.ADMIN_API_KEY = ADMIN_KEY;
	});

	afterEach(() => {
		__setAdminAgentsDbForTest(undefined);
		delete process.env.ADMIN_API_KEY;
		delete process.env.ELIZA_CLOUD_BASE_URL;
		delete process.env.ELIZA_CLOUD_SERVICE_KEY;
		delete process.env.ELIZA_CLOUD_API_KEY;
		delete process.env.ELIZAOS_CLOUD_API_KEY;
		delete process.env.ELIZAOS_API_KEY;
		delete process.env.ELIZACLOUD_API_KEY;
		delete process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI;
		delete process.env.WAIFU_CHAT_ACCESS_JWT_SECRET;
		delete process.env.WAIFU_API_BASE_URL;
		delete process.env.API_ORIGIN;
		delete process.env.NEXT_PUBLIC_API_URL;
		delete process.env.ELIZA_CLOUD_WEBHOOK_URL;
		delete process.env.WAIFU_ELIZA_CLOUD_WEBHOOK_URL;
		delete process.env.ELIZA_CLOUD_WEBHOOK_SECRET;
		delete process.env.WEBHOOK_RECEIVER_SECRET;
		delete process.env.WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE;
		delete process.env.DATABASE_URL;
	});

	it("enforces admin bearer auth before touching the database", async () => {
		const fake = createFakeDb();
		__setAdminAgentsDbForTest(fake.db as never);

		const missing = await request(`/${AGENT_ID}/state`);
		assert.equal(missing.status, 401);

		const wrong = await request(`/${AGENT_ID}/state`, { wrongAdmin: true });
		assert.equal(wrong.status, 403);
	});

	it("covers all admin state routes and emits moderation events", async () => {
		const fake = createFakeDb();
		__setAdminAgentsDbForTest(fake.db as never);

		let res = await request(`/${AGENT_ID}/brain/pause`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "bad tweet loop" }),
		});
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedReason, "bad tweet loop");
		assert.equal((await json(res)).data?.brainPaused, true);

		res = await request(`/${AGENT_ID}/brain/resume`, { method: "POST", admin: true });
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedAt, null);

		res = await request(`/${AGENT_ID}/withdrawals/pause`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "adapter review" }),
		});
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.withdrawalsPausedReason, "adapter review");

		res = await request(`/${AGENT_ID}/withdrawals/resume`, { method: "POST", admin: true });
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.withdrawalsPausedAt, null);

		res = await request(`/${AGENT_ID}/pause`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "full moderation pause" }),
		});
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedReason, "full moderation pause");
		assert.equal(fake.row()?.withdrawalsPausedReason, "full moderation pause");

		res = await request(`/${AGENT_ID}/resume`, { method: "POST", admin: true });
		assert.equal(res.status, 200);
		assert.equal(fake.row()?.brainPausedAt, null);
		assert.equal(fake.row()?.withdrawalsPausedAt, null);

		res = await request(`/${AGENT_ID}/kill`, {
			method: "POST",
			admin: true,
			body: JSON.stringify({ reason: "irrecoverable compromise" }),
		});
		assert.equal(res.status, 200);
		const killed = await json(res);
		assert.equal(killed.data?.killed, true);
		assert.equal(killed.data?.brainPaused, true);
		assert.equal(killed.data?.withdrawalsPaused, true);

		res = await request(`/${AGENT_ID}/state`, { admin: true });
		assert.equal(res.status, 200);
		const state = await json(res);
		assert.equal(state.data?.killed, true);
		assert.equal(state.data?.killedReason, "irrecoverable compromise");

		res = await request(`/${AGENT_ID}/brain/pause`, { method: "POST", admin: true });
		assert.equal(res.status, 409);

		res = await request(`/${AGENT_ID}/kill`, { method: "POST", admin: true });
		assert.equal(res.status, 409);

		assert.deepEqual(
			fake.events.map((event) => event.type),
			[
				"agent.paused",
				"agent.resumed",
				"agent.paused",
				"agent.resumed",
				"agent.paused",
				"agent.resumed",
				"agent.killed",
			],
		);
	});

	it("reports Eliza Cloud readiness without exposing secrets", async () => {
		const missing = await request("/eliza-cloud/status", { admin: true });
		assert.equal(missing.status, 200);
		let body = await json(missing);
		assert.equal(body.data?.ready as boolean | undefined, false);
		assert.deepEqual(body.data?.missing, [
			"serviceAuth",
			"containerImage",
			"chatAccessSecret",
			"webhookUrl",
			"webhookSecret",
			"database",
		]);

		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI = "ecr.test/waifu-agent:latest";
		process.env.WAIFU_CHAT_ACCESS_JWT_SECRET = "chat_secret";
		process.env.WAIFU_API_BASE_URL = "https://api.waifu.test";
		process.env.WEBHOOK_RECEIVER_SECRET = "webhook_secret";
		process.env.DATABASE_URL = "postgres://unit.test/waifu";
		const ready = await request("/eliza-cloud/status", { admin: true });
		assert.equal(ready.status, 200);
		body = await json(ready);
		assert.equal(body.data?.ready as boolean | undefined, true);
		assert.deepEqual(body.data?.missing, []);
		assert.equal((body.data?.checks as Record<string, boolean>).serviceAuth, true);
		assert.equal(JSON.stringify(body).includes("svc_admin_test"), false);
		assert.equal(JSON.stringify(body).includes("chat_secret"), false);
		assert.equal(JSON.stringify(body).includes("webhook_secret"), false);
	});

	it("test-provision endpoint deploys an Eliza Cloud container with wallet and access controls", async () => {
		process.env.ELIZA_CLOUD_BASE_URL = "https://cloud.test";
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";

		const requests: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
		mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requests.push({ url: String(url), body, headers: init?.headers as Record<string, string> });
			if (String(url).endsWith("/api/v1/agents")) {
				return Response.json({
					success: true,
					cloudAgentId: "cloud-admin-test",
					characterId: "character-admin-test",
					status: "running",
					containerUrl: "http://admin-bridge.internal",
					webUiUrl: "https://admin-agent.example",
					jobId: "job-admin-test",
					polling: {
						endpoint: "/api/v1/jobs/job-admin-test",
						intervalMs: 5000,
						expectedDurationMs: 90000,
					},
					account: {
						primaryWalletAddress: "0x0000000000000000000000000000000000000009",
						walletKeyRef: "steward:waifu-admin-test",
						organizationId: "org-admin-test",
						userId: "user-admin-test",
						isNewAccount: true,
						initialFreeCreditsUsd: 5,
					},
				});
			}
			throw new Error(`unexpected fetch ${url}`);
		});

		const res = await request("/eliza-cloud/test-provision", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				agentId: "waifu-admin-test",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				chain: "bsc",
				chainId: 56,
				tokenName: "Admin Test Waifu",
				tokenTicker: "ATEST",
				name: "Admin Test Waifu",
				bio: "admin provision route test",
				agentEvmAddress: "0x0000000000000000000000000000000000000009",
				walletKeyRef: "steward:waifu-admin-test",
				adminWallet: "0x0000000000000000000000000000000000000001",
				containerImageUri: "ecr.test/waifu-agent:latest",
				projectName: "waifu-admin-test",
				containerPort: 3000,
				containerCpu: 512,
				containerMemory: 1024,
				containerDesiredCount: 1,
				containerArchitecture: "arm64",
				containerHealthCheckPath: "/api/health",
				containerEnvironmentVars: {
					CUSTOM_ENV: "kept",
					IGNORED_NUMERIC_VALUE: 1,
				},
			}),
		});

		assert.equal(res.status, 200);
		assert.deepEqual(await json(res), {
			ok: true,
			data: {
				agentId: "waifu-admin-test",
				cloudAgentId: "cloud-admin-test",
				characterId: "character-admin-test",
				status: "running",
				containerUrl: "http://admin-bridge.internal",
				webUiUrl: "https://admin-agent.example",
				jobId: "job-admin-test",
				polling: {
					endpoint: "/api/v1/jobs/job-admin-test",
					intervalMs: 5000,
					expectedDurationMs: 90000,
				},
				account: {
					primaryWalletAddress: "0x0000000000000000000000000000000000000009",
					walletKeyRef: "steward:waifu-admin-test",
					organizationId: "org-admin-test",
					userId: "user-admin-test",
					isNewAccount: true,
					initialFreeCreditsUsd: 5,
				},
				tokenAddress: "0x0000000000000000000000000000000000000004",
				tokenChain: "bsc",
				tokenName: "Admin Test Waifu",
				tokenTicker: "ATEST",
			},
		});
		assert.equal(requests.length, 1);
		assert.equal(requests[0]?.headers["X-Service-Key"], "svc_admin_test");
		assert.equal(requests[0]?.headers["X-API-Key"], "svc_admin_test");
		assert.equal(requests[0]?.body.tokenContractAddress, "0x0000000000000000000000000000000000000004");
		assert.equal(requests[0]?.body.chain, "bsc");
		assert.equal(requests[0]?.body.tokenName, "Admin Test Waifu");
		assert.equal(requests[0]?.body.tokenTicker, "ATEST");

		assert.deepEqual(requests[0]?.body.account, {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:waifu-admin-test",
			chainType: "evm",
		});
		const character = requests[0]?.body.character as Record<string, unknown>;
		assert.deepEqual((character.config as Record<string, unknown>).account, {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:waifu-admin-test",
		});
		assert.deepEqual(requests[0]?.body.billing, { mode: "owner_credits", initialReserveUsd: 5 });
		assert.deepEqual(requests[0]?.body.access, {
			guestTokenThreshold: 1000,
			userTokenThreshold: 100000,
			adminWalletAddress: "0x0000000000000000000000000000000000000001",
			roles: {
				guest: { minTokens: 1000, comparison: "gt" },
				user: { minTokens: 100000, comparison: "gt" },
				admin: { wallets: ["0x0000000000000000000000000000000000000001"] },
			},
		});

		const container = requests[0]?.body.container as Record<string, unknown>;
		assert.equal(container.image, "ecr.test/waifu-agent:latest");
		assert.equal(container.projectName, "waifu-admin-test");
		assert.equal(container.port, 3000);
		assert.equal(container.cpu, 512);
		assert.equal(container.memory, 1024);
		assert.equal(container.desiredCount, 1);
		assert.equal(container.architecture, "arm64");
		assert.equal(container.healthCheckPath, "/api/health");
		const env = container.env as Record<string, string>;
		assert.equal(env.WAIFU_AGENT_EVM_ADDRESS, "0x0000000000000000000000000000000000000009");
		assert.equal(env.WAIFU_AGENT_EVM_KEY_REF, "steward:waifu-admin-test");
		assert.equal(env.WAIFU_INITIAL_CREDIT_USD, "5");
		assert.equal(env.WAIFU_ACCESS_GUEST_MIN_TOKENS, "1000");
		assert.equal(env.WAIFU_ACCESS_USER_MIN_TOKENS, "100000");
		assert.equal(env.WAIFU_ACCESS_THRESHOLD_MODE, "strict_gt");
		assert.equal(env.WAIFU_ACCESS_ADMIN_WALLETS, "0x0000000000000000000000000000000000000001");
		assert.equal(env.CUSTOM_ENV, "kept");
		assert.equal("IGNORED_NUMERIC_VALUE" in env, false);
	});

	it("test-provision endpoint rejects invalid token addresses before calling Eliza Cloud", async () => {
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		const fetchMock = mock.method(globalThis, "fetch", async () => {
			throw new Error("fetch should not be called");
		});

		const res = await request("/eliza-cloud/test-provision", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ tokenContractAddress: "not-an-address" }),
		});

		assert.equal(res.status, 400);
		assert.equal(fetchMock.mock.callCount(), 0);
	});

	it("test-provision endpoint rejects missing or invalid agent wallets before calling Eliza Cloud", async () => {
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		const fetchMock = mock.method(globalThis, "fetch", async () => {
			throw new Error("fetch should not be called");
		});

		let res = await request("/eliza-cloud/test-provision", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
			}),
		});

		assert.equal(res.status, 400);
		assert.equal((await json(res)).error, "INVALID_AGENT_WALLET");

		res = await request("/eliza-cloud/test-provision", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				agentEvmAddress: "not-an-address",
			}),
		});

		assert.equal(res.status, 400);
		assert.equal((await json(res)).error, "INVALID_AGENT_WALLET");
		assert.equal(fetchMock.mock.callCount(), 0);
	});

	it("test-enqueue-provisioning rejects invalid optional wallet fields before building payloads", async () => {
		let res = await request("/eliza-cloud/test-enqueue-provisioning", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				dryRun: true,
				agentId: "waifu-admin-test",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				agentEvmAddress: "not-an-address",
			}),
		});

		assert.equal(res.status, 400);
		assert.equal((await json(res)).error, "INVALID_AGENT_WALLET");

		res = await request("/eliza-cloud/test-enqueue-provisioning", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				dryRun: true,
				agentId: "waifu-admin-test",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				adminWallet: "not-an-address",
			}),
		});

		assert.equal(res.status, 400);
		assert.equal((await json(res)).error, "INVALID_ADMIN_WALLET");
	});

	it("test-enqueue-provisioning builds the bonding worker job payload in dry-run mode", async () => {
		const res = await request("/eliza-cloud/test-enqueue-provisioning", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				dryRun: true,
				agentId: "waifu-admin-test",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				chain: "bsc",
				chainId: 56,
				tokenName: "Admin Test Waifu",
				tokenTicker: "ATEST",
				agentEvmAddress: "0x0000000000000000000000000000000000000009",
				walletKeyRef: "steward:admin-test-key",
				adminWallet: "0x0000000000000000000000000000000000000001",
				containerImageUri: "ecr.test/waifu-agent:latest",
				projectName: "waifu-admin-test",
				containerPort: 3000,
				containerCpu: 512,
				containerMemory: 1024,
				containerDesiredCount: 1,
				containerArchitecture: "arm64",
				containerHealthCheckPath: "/api/health",
				containerEnvironmentVars: {
					CUSTOM_ENV: "kept",
					IGNORED_NUMERIC_VALUE: 1,
				},
				source: "agent.bonded",
				jobId: "admin-test-job",
			}),
		});

		assert.equal(res.status, 200);
		const body = await json(res);
		assert.equal(body.data?.enqueued, false);
		assert.equal(body.data?.dryRun, true);
		assert.equal(body.data?.jobId, "admin-test-job");
		assert.deepEqual(body.data?.payload, {
			agentId: "waifu-admin-test",
			source: "agent.bonded",
			data: {
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				tokenAddress: "0x0000000000000000000000000000000000000004",
				chain: "bsc",
				chainId: 56,
				tokenName: "Admin Test Waifu",
				tokenTicker: "ATEST",
				launchType: "native",
				agentWalletAddress: "0x0000000000000000000000000000000000000009",
				walletKeyRef: "steward:admin-test-key",
				adminWallets: ["0x0000000000000000000000000000000000000001"],
				containerImageUri: "ecr.test/waifu-agent:latest",
				containerProjectName: "waifu-admin-test",
				containerPort: 3000,
				containerCpu: 512,
				containerMemory: 1024,
				containerDesiredCount: 1,
				containerArchitecture: "arm64",
				containerHealthCheckPath: "/api/health",
				containerEnvironmentVars: {
					CUSTOM_ENV: "kept",
				},
			},
		});
	});

	it("test-runtime-ref returns worker-written Eliza Cloud runtime metadata", async () => {
		const fake = createFakeDb({
			...freshRow(),
			agentId: "waifu-worker-test",
			elizaCloudAgentId: "cloud-worker-test",
			runtimeKind: "eliza-cloud",
			metadata: {
				provisioning: {
					cloudAgentId: "cloud-worker-test",
					containerId: "container-worker-test",
					containerUrl: "http://worker-bridge.internal",
					webUiUrl: "https://agent.example",
					status: "running",
					account: {
						primaryWalletAddress: "0x0000000000000000000000000000000000000009",
						walletKeyRef: "steward:waifu-worker-test",
						organizationId: "org-worker-test",
						userId: "user-worker-test",
						isNewAccount: true,
						initialFreeCreditsUsd: 5,
					},
					walletProvisioning: {
						address: "0x0000000000000000000000000000000000000009",
					},
					polling: {
						endpoint: "/api/v1/jobs/job-worker-test",
						intervalMs: 5000,
						expectedDurationMs: 90000,
					},
				},
			},
		});
		__setAdminAgentsDbForTest(fake.db as never);

		const res = await request("/eliza-cloud/test-runtime-ref?agentId=waifu-worker-test", { admin: true });

		assert.equal(res.status, 200);
		assert.deepEqual(await json(res), {
			ok: true,
			data: {
				agentId: "waifu-worker-test",
				cloudAgentId: "cloud-worker-test",
				containerId: "container-worker-test",
				containerUrl: "http://worker-bridge.internal",
				webUiUrl: "https://agent.example",
				status: "running",
				account: {
					primaryWalletAddress: "0x0000000000000000000000000000000000000009",
					walletKeyRef: "steward:waifu-worker-test",
					organizationId: "org-worker-test",
					userId: "user-worker-test",
					isNewAccount: true,
					initialFreeCreditsUsd: 5,
				},
				walletProvisioning: {
					address: "0x0000000000000000000000000000000000000009",
				},
				polling: {
					endpoint: "/api/v1/jobs/job-worker-test",
					intervalMs: 5000,
					expectedDurationMs: 90000,
				},
			},
		});
	});

	it("test-runtime-ref reports pending worker provisioning without runtime ids", async () => {
		const fake = createFakeDb({
			...freshRow(),
			agentId: "waifu-worker-pending",
			runtimeKind: "eliza-cloud",
			metadata: {
				provisioning: {
					status: "queued",
					polling: { endpoint: "/api/v1/jobs/job-worker-pending" },
				},
			},
		});
		__setAdminAgentsDbForTest(fake.db as never);

		const res = await request("/eliza-cloud/test-runtime-ref?agentId=waifu-worker-pending", { admin: true });

		assert.equal(res.status, 409);
		const body = await json(res);
		assert.equal(body.ok, false);
		assert.equal(body.error, "RUNTIME_NOT_READY");
		assert.deepEqual(body.data, {
			agentId: "waifu-worker-pending",
			runtimeKind: "eliza-cloud",
			provisioning: {
				status: "queued",
				polling: { endpoint: "/api/v1/jobs/job-worker-pending" },
			},
		});
	});

	it("test-proof returns a bonded worker proof ledger in dry-run mode", async () => {
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI = "ecr.test/waifu-agent:latest";
		process.env.WAIFU_CHAT_ACCESS_JWT_SECRET = "chat_secret";
		process.env.WAIFU_API_BASE_URL = "https://api.waifu.test";
		process.env.WEBHOOK_RECEIVER_SECRET = "webhook_secret";
		process.env.DATABASE_URL = "postgres://unit.test/waifu";
		const fake = createFakeDb({
			...freshRow(),
			agentId: "waifu-proof-test",
			runtimeKind: "eliza-cloud",
			metadata: { provisioning: { status: "queued" } },
		});
		__setAdminAgentsDbForTest(fake.db as never);

		const res = await request("/eliza-cloud/test-proof", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				dryRun: true,
				agentId: "waifu-proof-test",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				agentEvmAddress: "0x0000000000000000000000000000000000000009",
				adminWallet: "0x0000000000000000000000000000000000000001",
				containerImageUri: "ecr.test/waifu-agent:latest",
				projectName: "waifu-proof-test",
				containerPort: 3000,
				source: "agent.bonded",
				jobId: "proof-job-dry-run",
			}),
		});

		assert.equal(res.status, 200);
		const body = await json(res);
		assert.equal(body.data?.jobId, "proof-job-dry-run");
		const steps = body.data?.steps as Array<{ key: string; state: string; data?: Record<string, unknown> }>;
		assert.deepEqual(
			steps.map((step) => [step.key, step.state]),
			[
				["readiness", "passed"],
				["agent.bonded", "skipped"],
				["runtime", "skipped"],
				["runtime-status", "skipped"],
				["credits", "skipped"],
				["lifecycle", "skipped"],
			],
		);
		const payload = (steps[1]?.data as Record<string, unknown>).payload as Record<string, unknown>;
		assert.equal(payload.source, "agent.bonded");
		assert.deepEqual((payload.data as Record<string, unknown>).containerProjectName, "waifu-proof-test");
		assert.deepEqual((payload.data as Record<string, unknown>).containerPort, 3000);
	});

	it("test-proof refuses real enqueue when Eliza Cloud readiness is missing", async () => {
		process.env.WAIFU_ENABLE_ELIZA_CLOUD_TEST_PAGE = "true";
		const fake = createFakeDb({
			...freshRow(),
			agentId: "waifu-proof-not-ready",
			runtimeKind: "eliza-cloud",
		});
		__setAdminAgentsDbForTest(fake.db as never);

		const res = await request("/eliza-cloud/test-proof", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				dryRun: false,
				agentId: "waifu-proof-not-ready",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				agentEvmAddress: "0x0000000000000000000000000000000000000009",
				source: "agent.bonded",
				jobId: "proof-job-not-ready",
			}),
		});

		assert.equal(res.status, 503);
		const body = await json(res);
		assert.equal(body.ok, false);
		assert.equal(body.error, "ELIZA_CLOUD_NOT_READY");
		assert.equal(body.data?.jobId, "proof-job-not-ready");
		assert.equal(body.data?.ready, false);
		const steps = body.data?.steps as Array<{ key: string; state: string; detail?: string }>;
		assert.deepEqual(
			steps.map((step) => [step.key, step.state]),
			[["readiness", "failed"]],
		);
		assert.match(steps[0]?.detail ?? "", /missing:/);
	});

	it("test-proof verifies hosted runtime status and credit balance when runtime metadata exists", async () => {
		process.env.ELIZA_CLOUD_BASE_URL = "https://cloud.test";
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI = "ecr.test/waifu-agent:latest";
		process.env.WAIFU_CHAT_ACCESS_JWT_SECRET = "chat_secret";
		process.env.WAIFU_API_BASE_URL = "https://api.waifu.test";
		process.env.WEBHOOK_RECEIVER_SECRET = "webhook_secret";
		process.env.DATABASE_URL = "postgres://unit.test/waifu";
		const fake = createFakeDb({
			...freshRow(),
			agentId: "waifu-proof-runtime-test",
			elizaCloudAgentId: "cloud-proof-test",
			runtimeKind: "eliza-cloud",
			metadata: {
				provisioning: {
					cloudAgentId: "cloud-proof-test",
					containerId: "container-proof-test",
					webUiUrl: "https://proof-agent.example",
					status: "running",
				},
			},
		});
		__setAdminAgentsDbForTest(fake.db as never);
		const requests: Array<{ method?: string; url: string }> = [];
		mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
			requests.push({ method: init?.method, url: String(url) });
			if (String(url).endsWith("/api/v1/agents/cloud-proof-test/status")) {
				return Response.json({
					success: true,
					data: {
						cloudAgentId: "cloud-proof-test",
						containerId: "container-proof-test",
						status: "running",
						webUiUrl: "https://proof-agent.example",
					},
				});
			}
			if (String(url).includes("/api/v1/credits/balance")) {
				return Response.json({ success: true, balance: 4.25 });
			}
			throw new Error(`unexpected fetch ${url}`);
		});

		const res = await request("/eliza-cloud/test-proof", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				dryRun: true,
				agentId: "waifu-proof-runtime-test",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				agentEvmAddress: "0x0000000000000000000000000000000000000009",
				source: "agent.bonded",
			}),
		});

		assert.equal(res.status, 200);
		const body = await json(res);
		assert.equal(body.data?.ready, true);
		const steps = body.data?.steps as Array<{ key: string; state: string }>;
		assert.equal(steps.find((step) => step.key === "runtime")?.state, "passed");
		assert.equal(steps.find((step) => step.key === "runtime-status")?.state, "passed");
		assert.equal(steps.find((step) => step.key === "credits")?.state, "passed");
		assert.deepEqual(
			requests.map((request) => [request.method, request.url]),
			[
				["GET", "https://cloud.test/api/v1/agents/cloud-proof-test/status"],
				["GET", "https://cloud.test/api/v1/credits/balance?fresh=true&agent_id=cloud-proof-test"],
			],
		);
	});

	it("test-control endpoint pauses, resumes, restarts, and tops up Eliza Cloud test containers", async () => {
		process.env.ELIZA_CLOUD_BASE_URL = "https://cloud.test";
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		const requests: Array<{
			url: string;
			method?: string;
			body: Record<string, unknown>;
			headers: Record<string, string>;
		}> = [];
		mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
			const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
			requests.push({ url: String(url), method: init?.method, body, headers: init?.headers as Record<string, string> });
			if (String(url).endsWith("/api/v1/agents/cloud-admin-test/status")) {
				return Response.json({
					success: true,
					data: {
						cloudAgentId: "cloud-admin-test",
						containerId: "container-admin-test",
						containerUrl: "http://admin-bridge.internal",
						webUiUrl: "https://admin-agent.example",
						status: "running",
					},
				});
			}
			if (String(url).includes("/api/v1/credits/balance")) {
				return Response.json({
					success: true,
					balance: 4.5,
				});
			}
			if (String(url).includes("/api/billing/checkout/verify")) {
				return Response.json({ success: true, balance: 9.5, alreadyApplied: false });
			}
			return Response.json({ success: true, data: { status: "queued", jobId: `job-${requests.length}` } });
		});

		let res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "pause", cloudAgentId: "cloud-admin-test", containerId: "container-admin-test" }),
		});
		assert.equal(res.status, 200);
		let controlBody = await json(res);
		assert.equal(controlBody.data?.action, "pause");
		assert.equal(controlBody.data?.cloudAgentId, "cloud-admin-test");

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "resume", cloudAgentId: "cloud-admin-test", containerId: "container-admin-test" }),
		});
		assert.equal(res.status, 200);
		controlBody = await json(res);
		assert.equal(controlBody.data?.action, "resume");
		assert.equal(controlBody.data?.cloudAgentId, "cloud-admin-test");

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "restart", cloudAgentId: "cloud-admin-test", containerId: "container-admin-test" }),
		});
		assert.equal(res.status, 200);
		controlBody = await json(res);
		assert.equal(controlBody.data?.action, "restart");
		assert.equal(controlBody.data?.cloudAgentId, "cloud-admin-test");

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "status", cloudAgentId: "cloud-admin-test" }),
		});
		assert.equal(res.status, 200);
		controlBody = await json(res);
		assert.equal((controlBody.data?.status as Record<string, unknown>).status, "running");
		assert.equal((controlBody.data?.status as Record<string, unknown>).webUiUrl, "https://admin-agent.example");

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "top-up", cloudAgentId: "cloud-admin-test", amountUsdCents: 500 }),
		});
		assert.equal(res.status, 200);
		assert.equal((await json(res)).data?.action, "top-up");

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "balance", cloudAgentId: "cloud-admin-test" }),
		});
		assert.equal(res.status, 200);
		assert.equal((await json(res)).data?.balance.balance, 4.5);

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({ action: "verify-top-up", cloudAgentId: "cloud-admin-test", sessionId: "cs_admin_test" }),
		});
		assert.equal(res.status, 200);
		controlBody = await json(res);
		assert.equal(controlBody.data?.verification.balance, 9.5);
		assert.equal(controlBody.data?.balance.balance, 4.5);
		assert.equal((controlBody.data?.status as Record<string, unknown>).status, "running");

		assert.equal(requests.length, 9);
		assert.equal(requests[0]?.method, "POST");
		assert.equal(requests[0]?.url, "https://cloud.test/api/v1/agents/cloud-admin-test/suspend");
		assert.deepEqual(requests[0]?.body, { reason: "waifu runtime pause" });
		assert.equal(requests[1]?.method, "POST");
		assert.equal(requests[1]?.url, "https://cloud.test/api/v1/agents/cloud-admin-test/resume");
		assert.deepEqual(requests[1]?.body, {});
		assert.equal(requests[2]?.method, "POST");
		assert.equal(requests[2]?.url, "https://cloud.test/api/v1/agents/cloud-admin-test/restart");
		assert.deepEqual(requests[2]?.body, {});
		assert.equal(requests[3]?.method, "GET");
		assert.equal(requests[3]?.url, "https://cloud.test/api/v1/agents/cloud-admin-test/status");
		assert.deepEqual(requests[3]?.body, {});
		assert.equal(requests[4]?.method, "POST");
		assert.equal(requests[4]?.url, "https://cloud.test/api/v1/credits/checkout");
		assert.equal(requests[4]?.body.credits, 5);
		assert.equal(requests[5]?.method, "GET");
		assert.equal(requests[5]?.url, "https://cloud.test/api/v1/credits/balance?fresh=true&agent_id=cloud-admin-test");
		assert.equal(requests[6]?.method, "POST");
		assert.equal(requests[6]?.url, "https://cloud.test/api/billing/checkout/verify");
		assert.deepEqual(requests[6]?.body, { session_id: "cs_admin_test", from: "waifu-agent-runtime" });
		assert.equal(requests[7]?.method, "GET");
		assert.equal(requests[7]?.url, "https://cloud.test/api/v1/credits/balance?fresh=true&agent_id=cloud-admin-test");
		assert.equal(requests[8]?.method, "GET");
		assert.equal(requests[8]?.url, "https://cloud.test/api/v1/agents/cloud-admin-test/status");
		assert.equal(requests[0]?.headers["X-Service-Key"], "svc_admin_test");
		assert.equal(requests[0]?.headers["X-API-Key"], "svc_admin_test");
	});

	it("test-control endpoint can simulate Eliza Cloud credit lifecycle webhooks", async () => {
		process.env.ELIZA_CLOUD_BASE_URL = "https://cloud.test";
		process.env.ELIZA_CLOUD_SERVICE_KEY = "svc_admin_test";
		const fake = createFakeDb({
			...freshRow(),
			agentId: "waifu-lifecycle-test",
			elizaCloudAgentId: "cloud-lifecycle-test",
		});
		__setAdminAgentsDbForTest(fake.db as never);
		const requests: Array<{ url: string; method?: string; body: Record<string, unknown> }> = [];
		mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
			const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
			requests.push({ url: String(url), method: init?.method, body });
			if (String(url).endsWith("/status")) {
				return Response.json({
					success: true,
					data: {
						cloudAgentId: "cloud-lifecycle-test",
						containerId: "container-lifecycle-test",
						status: requests.some((request) => request.url.endsWith("/suspend")) ? "suspended" : "running",
						webUiUrl: "https://lifecycle-agent.example",
					},
				});
			}
			return Response.json({ success: true, data: { ok: true } });
		});

		let res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				action: "webhook-depleted",
				agentId: "waifu-lifecycle-test",
				cloudAgentId: "cloud-lifecycle-test",
				containerId: "container-lifecycle-test",
			}),
		});
		let text = await res.text();
		assert.equal(res.status, 200, text);
		let body = JSON.parse(text);
		assert.equal(body.data?.action, "webhook-depleted");
		assert.equal(body.data?.agentId, "waifu-lifecycle-test");
		assert.equal((body.data?.status as Record<string, unknown>).status, "suspended");

		res = await request("/eliza-cloud/test-control", {
			method: "POST",
			admin: true,
			body: JSON.stringify({
				action: "webhook-topped-up",
				agentId: "waifu-lifecycle-test",
				cloudAgentId: "cloud-lifecycle-test",
				containerId: "container-lifecycle-test",
				amountUsdCents: 500,
				sessionId: "cs_lifecycle_test",
			}),
		});
		text = await res.text();
		assert.equal(res.status, 200, text);
		body = JSON.parse(text);
		assert.equal(body.data?.action, "webhook-topped-up");
		assert.equal(body.data?.agentId, "waifu-lifecycle-test");

		assert.deepEqual(
			requests.map((request) => [request.method, request.url]),
			[
				["POST", "https://cloud.test/api/v1/agents/cloud-lifecycle-test/suspend"],
				["GET", "https://cloud.test/api/v1/agents/cloud-lifecycle-test/status"],
				["POST", "https://cloud.test/api/v1/agents/cloud-lifecycle-test/resume"],
				["GET", "https://cloud.test/api/v1/agents/cloud-lifecycle-test/status"],
				["GET", "https://cloud.test/api/v1/agents/cloud-lifecycle-test/status"],
			],
		);
	});
});
