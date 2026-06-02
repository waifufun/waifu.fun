import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { AgentProvisioningJob } from "@waifufun/queue/jobs";

import { adaptivePollDelayMs, createAgentProvisioningProcessor } from "./agent-provisioning.js";

type UpdateRecord = { table: unknown; values: Record<string, unknown> };
type InsertRecord = { table: unknown; values: Record<string, unknown> };

function withEnv<T>(values: Record<string, string>, fn: () => Promise<T>): Promise<T> {
	const previous = new Map<string, string | undefined>();
	for (const [key, value] of Object.entries(values)) {
		previous.set(key, process.env[key]);
		process.env[key] = value;
	}
	return fn().finally(() => {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
}

test("agent-provisioning worker creates Eliza Cloud app agent, deploys container, and syncs runtime overlay", async () => {
	const updates: UpdateRecord[] = [];
	const inserts: InsertRecord[] = [];
	const returningAgents: Array<{ id: string }> = [];
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-01",
		name: "Worker Waifu",
		bio: "worker provision test",
		avatarUrl: "https://example.com/a.png",
		systemPrompt: null,
		claimedByXHandle: null,
		twitterHandle: null,
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Worker Waifu", symbol: "WORK" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const tokenRow = { id: "token-row-1", agentId: null };
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("safeAddress" in fields) {
										return Promise.resolve([{ safeAddress: "0x0000000000000000000000000000000000000003" }]);
									}
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									if ("token" in fields) {
										return Promise.resolve([{ token: tokenRow, agent: null }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update(table: unknown) {
			return {
				set(values: Record<string, unknown>) {
					updates.push({ table, values });
					return { where: () => Promise.resolve() };
				},
			};
		},
		insert(table: unknown) {
			return {
				values(values: Record<string, unknown>) {
					inserts.push({ table, values });
					return {
						returning() {
							if ("eventType" in values) {
								return Promise.resolve([
									{
										id: "event-row-1",
										eventType: values.eventType,
										agentId: values.agentId,
										tokenAddress: values.tokenAddress,
										data: values.data,
										createdAt: new Date("2026-05-27T00:00:00Z"),
									},
								]);
							}
							const created = { id: "agent-overlay-1" };
							returningAgents.push(created);
							return Promise.resolve([created]);
						},
					};
				},
			};
		},
	} as never;

	const requests: Array<{ url: string; body: Record<string, unknown> | null; headers: Record<string, string> }> = [];
	let statusPolls = 0;
	mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		requests.push({ url: String(url), body, headers: init?.headers as Record<string, string> });
		if (String(url).endsWith("/api/v1/agents")) {
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "123e4567-e89b-12d3-a456-426614174000",
					characterId: "character-worker",
					status: "ready",
					containerUrl: "http://worker-bridge.initial.internal",
					jobId: "job-worker",
					walletProvisioning: {
						id: "wallet-worker",
						address: "0x0000000000000000000000000000000000000009",
						chainType: "evm",
						clientAddress: "0x0000000000000000000000000000000000000009",
					},
					account: {
						primaryWalletAddress: "0x0000000000000000000000000000000000000009",
						organizationId: "org-worker",
						userId: "user-worker",
						isNewAccount: true,
						initialFreeCreditsUsd: 5,
					},
					polling: { endpoint: "/api/v1/jobs/job-worker" },
				},
			});
		}
		if (String(url).endsWith("/api/v1/agents/123e4567-e89b-12d3-a456-426614174000/status")) {
			statusPolls += 1;
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "123e4567-e89b-12d3-a456-426614174000",
					containerId: "container-worker",
					containerUrl: "http://worker-bridge.internal",
					...(statusPolls > 1 ? { webUiUrl: "https://worker-agent.example" } : {}),
					status: "running",
				},
			});
		}
		throw new Error(`unexpected fetch ${url}`);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_CHAT_ACCESS_JWT_SECRET: "chat_secret_worker",
			WAIFU_CHAT_FRAME_ANCESTORS: "https://waifu.fun https://staging.waifu.fun",
			WAIFU_ELIZA_DEFAULT_MODEL: "openai/gpt-oss-120b",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-demo-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Worker Waifu",
					tokenTicker: "WORK",
					launchType: "native",
					walletAddress: "0x0000000000000000000000000000000000000002",
					agentWalletAddress: "0x0000000000000000000000000000000000000009",
					walletKeyRef: "steward:custom-worker-key",
					containerImageUri: "ecr.test/waifu-agent:bonded",
					containerProjectName: "waifu-demo-01",
					containerPort: 3000,
					containerCpu: 512,
					containerMemory: 1024,
					containerDesiredCount: 1,
					containerArchitecture: "arm64",
					containerHealthCheckPath: "/api/health",
					containerEnvironmentVars: {
						CUSTOM_ENV: "kept",
						ELIZA_UI_ENABLE: "false",
						IGNORED_NUMERIC_VALUE: 1,
					},
					poolAddress: "0x0000000000000000000000000000000000000008",
					dexName: "pancakeswap",
				},
			};
			const result = await processor({ id: "job-1", data: payload, attemptsMade: 0 } as never);
			assert.deepEqual(result, {
				agentId: "waifu-demo-01",
				cloudAgentId: "123e4567-e89b-12d3-a456-426614174000",
				containerId: "container-worker",
				containerUrl: "http://worker-bridge.internal",
				webUiUrl: "https://worker-agent.example",
				jobId: "job-worker",
				status: "running",
				walletProvisioning: {
					id: "wallet-worker",
					address: "0x0000000000000000000000000000000000000009",
					chainType: "evm",
					clientAddress: "0x0000000000000000000000000000000000000009",
				},
				account: {
					primaryWalletAddress: "0x0000000000000000000000000000000000000009",
					organizationId: "org-worker",
					userId: "user-worker",
					isNewAccount: true,
					initialFreeCreditsUsd: 5,
				},
				polling: { endpoint: "/api/v1/jobs/job-worker" },
			});
		},
	);

	assert.equal(requests.length, 3);
	assert.equal(requests[0]?.headers["X-Service-Key"], "svc_worker");
	assert.equal(requests[0]?.headers["X-API-Key"], "svc_worker");
	assert.equal(requests[0]?.body?.tokenContractAddress, "0x0000000000000000000000000000000000000004");
	assert.equal(requests[0]?.body?.chain, "bsc");
	assert.equal(requests[0]?.body?.tokenName, "Worker Waifu");
	assert.equal(requests[0]?.body?.tokenTicker, "WORK");
	assert.deepEqual(requests[0]?.body?.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		chainType: "evm",
		walletKeyRef: "steward:custom-worker-key",
	});
	const character = requests[0]?.body?.character as Record<string, unknown>;
	assert.deepEqual((character.config as Record<string, unknown>).account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:custom-worker-key",
	});
	assert.deepEqual(requests[0]?.body?.billing, {
		mode: "owner_credits",
		initialReserveUsd: 5,
	});
	assert.deepEqual(requests[0]?.body?.access, {
		guestTokenThreshold: 1000,
		userTokenThreshold: 100000,
		adminWalletAddress: "0x0000000000000000000000000000000000000002",
		roles: {
			guest: { minTokens: 1000, comparison: "gt" },
			user: { minTokens: 100000, comparison: "gt" },
			admin: { wallets: ["0x0000000000000000000000000000000000000002"] },
		},
	});

	const container = requests[0]?.body?.container as Record<string, unknown>;
	assert.equal(container.image, "ecr.test/waifu-agent:bonded");
	assert.equal(container.projectName, "waifu-demo-01");
	assert.equal(container.port, 3000);
	assert.equal(container.cpu, 512);
	assert.equal(container.memory, 1024);
	assert.equal(container.desiredCount, 1);
	assert.equal(container.architecture, "arm64");
	assert.equal(container.healthCheckPath, "/api/health");
	const env = container.env as Record<string, string>;
	assert.equal(env.WAIFU_AGENT_EVM_ADDRESS, "0x0000000000000000000000000000000000000009");
	assert.equal(env.WAIFU_AGENT_EVM_KEY_REF, "steward:custom-worker-key");
	assert.equal(env.ELIZA_UI_ENABLE, "true");
	assert.equal(env.CUSTOM_ENV, "kept");
	assert.equal("IGNORED_NUMERIC_VALUE" in env, false);
	assert.equal(env.WAIFU_CHAT_ACCESS_JWT_SECRET, "chat_secret_worker");
	assert.equal(env.WAIFU_CHAT_FRAME_ANCESTORS, "https://waifu.fun https://staging.waifu.fun");
	assert.equal(env.WAIFU_INITIAL_CREDIT_USD, "5");
	assert.equal(env.WAIFU_ACCESS_GUEST_MIN_TOKENS, "1000");
	assert.equal(env.WAIFU_ACCESS_USER_MIN_TOKENS, "100000");
	assert.equal(env.WAIFU_ACCESS_THRESHOLD_MODE, "strict_gt");
	assert.equal(env.WAIFU_ACCESS_ADMIN_WALLETS, "0x0000000000000000000000000000000000000002");
	assert.equal(requests[1]?.url, "https://cloud.test/api/v1/agents/123e4567-e89b-12d3-a456-426614174000/status");
	assert.equal(requests[2]?.url, "https://cloud.test/api/v1/agents/123e4567-e89b-12d3-a456-426614174000/status");

	assert.equal(returningAgents.length, 1);
	assert.ok(updates.some((update) => update.values.runtimeKind === "eliza-cloud"));
	assert.ok(
		updates.some((update) => update.values.agentStatus === "running" && update.values.ownerClaimStatus === "claimed"),
	);
	assert.ok(inserts.some((insert) => insert.values.webUiUrl === "https://worker-agent.example"));
	assert.ok(inserts.some((insert) => insert.values.cloudAgentId === "123e4567-e89b-12d3-a456-426614174000"));
	assert.ok(inserts.some((insert) => insert.values.eventType === "agent.provisioned"));
	assert.ok(
		inserts.some(
			(insert) =>
				insert.values.eventType === "agent.provisioned" &&
				(insert.values.data as { webUiUrl?: string }).webUiUrl === "https://worker-agent.example",
		),
	);
});

test("agent-provisioning worker retries until a hosted chat URL exists", async () => {
	const updates: UpdateRecord[] = [];
	const inserts: InsertRecord[] = [];
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-no-url-01",
		name: "No URL Waifu",
		bio: "running container without public url",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "No URL Waifu", symbol: "NOURL" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const tokenRow = { id: "token-row-1", agentId: "agent-overlay-1" };
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									if ("token" in fields) {
										return Promise.resolve([{ token: tokenRow, agent: { id: "agent-overlay-1" } }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update(table: unknown) {
			return {
				set(values: Record<string, unknown>) {
					updates.push({ table, values });
					return { where: () => Promise.resolve() };
				},
			};
		},
		insert(table: unknown) {
			return {
				values(values: Record<string, unknown>) {
					inserts.push({ table, values });
					return {
						returning() {
							return Promise.resolve([{ id: "event-row-no-url", eventType: values.eventType }]);
						},
					};
				},
			};
		},
	} as never;
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		if (String(url).endsWith("/api/v1/agents")) {
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "cloud-no-url-1",
					status: "pending",
					jobId: "job-no-url",
				},
			});
		}
		return Response.json({
			success: true,
			data: {
				cloudAgentId: "cloud-no-url-1",
				containerId: "container-no-url-1",
				status: "running",
			},
		});
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_ATTEMPTS: "1",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-no-url-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "No URL Waifu",
					tokenTicker: "NOURL",
					launchType: "native",
				},
			};
			await assert.rejects(
				() =>
					processor({
						id: "job-no-url",
						data: payload,
						attemptsMade: 2,
						opts: { attempts: 12 },
					} as never),
				/hosted chat URL is not ready/,
			);
		},
	);

	assert.ok(
		updates.some(
			(update) =>
				update.values.agentStatus === "provisioning" &&
				update.values.lifecycleState === "birth" &&
				update.values.webUiUrl === null,
		),
	);
	assert.equal(
		inserts.some((insert) => insert.values.eventType === "agent.provisioned"),
		false,
	);
	assert.equal(
		inserts.some((insert) => insert.values.eventType === "agent.provisioning_dead_letter"),
		false,
	);
});

test("agent-provisioning worker dead-letters hosted chat URL readiness on the final attempt", async () => {
	const inserts: InsertRecord[] = [];
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-final-no-url-01",
		name: "Final No URL Waifu",
		bio: "final attempt without public url",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Final No URL Waifu", symbol: "FURL" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									if ("token" in fields) {
										return Promise.resolve([{ token: { id: "token-row-1", agentId: null }, agent: null }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return { set: () => ({ where: () => Promise.resolve() }) };
		},
		insert(table: unknown) {
			return {
				values(values: Record<string, unknown>) {
					inserts.push({ table, values });
					return {
						returning() {
							return Promise.resolve([{ id: "event-row-final-no-url", eventType: values.eventType }]);
						},
					};
				},
			};
		},
	} as never;
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		if (String(url).endsWith("/api/v1/agents")) {
			return Response.json({
				success: true,
				data: { cloudAgentId: "cloud-final-no-url-1", status: "pending", jobId: "job-final-no-url" },
			});
		}
		return Response.json({
			success: true,
			data: { cloudAgentId: "cloud-final-no-url-1", containerId: "container-final-no-url-1", status: "running" },
		});
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_ATTEMPTS: "1",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-final-no-url-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Final No URL Waifu",
					tokenTicker: "FURL",
					launchType: "native",
				},
			};
			await assert.rejects(
				() =>
					processor({
						id: "job-final-no-url",
						data: payload,
						attemptsMade: 11,
						opts: { attempts: 12 },
					} as never),
				/hosted chat URL is not ready/,
			);
		},
	);

	assert.ok(
		inserts.some(
			(insert) =>
				insert.values.eventType === "agent.provisioning_dead_letter" &&
				(insert.values.data as { attempts?: number; error?: string }).attempts === 12 &&
				(insert.values.data as { error?: string }).error?.includes("hosted chat URL is not ready"),
		),
	);
});

test("agent-provisioning worker skips duplicate Eliza Cloud launches when metadata already exists", async () => {
	const inserts: InsertRecord[] = [];
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-01",
		name: "Worker Waifu",
		bio: "worker provision test",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Worker Waifu", symbol: "WORK" },
		metadata: {
			provisioning: {
				runtimeKind: "eliza-cloud",
				cloudAgentId: "cloud-existing-1",
				runtimeAgentId: "cloud-existing-1",
				containerId: "container-existing-1",
				webUiUrl: "https://existing-agent.example",
				status: "running",
				account: {
					primaryWalletAddress: "0x0000000000000000000000000000000000000009",
					initialFreeCreditsUsd: 5,
				},
			},
		},
		runtimeKind: "eliza-cloud",
	};
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([persona]);
								},
							};
						},
					};
				},
			};
		},
		insert(table: unknown) {
			return {
				values(values: Record<string, unknown>) {
					inserts.push({ table, values });
					return {
						returning() {
							return Promise.resolve([
								{
									id: "event-row-duplicate",
									eventType: values.eventType,
									agentId: values.agentId,
									data: values.data,
									createdAt: new Date("2026-05-27T00:00:00Z"),
								},
							]);
						},
					};
				},
			};
		},
		update() {
			throw new Error("duplicate provisioning should not update runtime metadata");
		},
	} as never;
	const fetchMock = mock.method(globalThis, "fetch", async () => {
		throw new Error("Eliza Cloud should not be called when runtime metadata already exists");
	});

	const processor = createAgentProvisioningProcessor({
		db,
		logger: console as never,
		startedAt: new Date("2026-05-27T00:00:00Z"),
		chainId: 56,
	});
	const payload: AgentProvisioningJob = {
		agentId: "waifu-demo-01",
		source: "token.migrated",
		data: {
			tokenContractAddress: "0x0000000000000000000000000000000000000004",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			chainId: 56,
			tokenName: "Worker Waifu",
			tokenTicker: "WORK",
			launchType: "native",
		},
	};
	const result = await processor({ id: "job-duplicate", data: payload, attemptsMade: 0 } as never);

	assert.deepEqual(result, {
		agentId: "waifu-demo-01",
		cloudAgentId: "cloud-existing-1",
		containerId: "container-existing-1",
		webUiUrl: "https://existing-agent.example",
		jobId: "cloud-existing-1",
		status: "running",
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			initialFreeCreditsUsd: 5,
		},
		polling: null,
	});
	assert.equal(fetchMock.mock.callCount(), 0);
	assert.ok(
		inserts.some(
			(insert) =>
				insert.values.eventType === "agent.provisioned" &&
				(insert.values.data as { runtimeAgentId?: string }).runtimeAgentId === "cloud-existing-1",
		),
	);
});

test("agent-provisioning worker polls partial Eliza Cloud metadata instead of skipping hosted sync", async () => {
	const updates: UpdateRecord[] = [];
	const inserts: InsertRecord[] = [];
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-partial",
		name: "Partial Worker Waifu",
		bio: "partial runtime test",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Partial Worker Waifu", symbol: "PART" },
		metadata: {
			provisioning: {
				runtimeKind: "eliza-cloud",
				cloudAgentId: "cloud-partial-1",
				runtimeAgentId: "cloud-partial-1",
				status: "pending",
			},
		},
		runtimeKind: "eliza-cloud",
	};
	const tokenRow = { id: "token-row-1", agentId: "agent-overlay-1" };
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									if ("token" in fields) {
										return Promise.resolve([{ token: tokenRow, agent: { id: "agent-overlay-1" } }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update(table: unknown) {
			return {
				set(values: Record<string, unknown>) {
					updates.push({ table, values });
					return { where: () => Promise.resolve() };
				},
			};
		},
		insert(table: unknown) {
			return {
				values(values: Record<string, unknown>) {
					inserts.push({ table, values });
					return {
						returning() {
							return Promise.resolve([{ id: "event-row-partial", eventType: values.eventType }]);
						},
					};
				},
			};
		},
	} as never;
	const requests: string[] = [];
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		requests.push(String(url));
		if (String(url).endsWith("/api/v1/agents")) {
			throw new Error("partial metadata should not create a duplicate Eliza Cloud agent");
		}
		return Response.json({
			success: true,
			data: {
				cloudAgentId: "cloud-partial-1",
				containerId: "container-partial-1",
				containerUrl: "https://partial-runtime.example",
				webUiUrl: "https://partial-agent.example",
				status: "running",
			},
		});
	});

	await withEnv({ ELIZA_CLOUD_SERVICE_KEY: "svc" }, async () => {
		const processor = createAgentProvisioningProcessor({
			db,
			logger: console as never,
			startedAt: new Date("2026-05-27T00:00:00Z"),
			chainId: 56,
		});
		const payload: AgentProvisioningJob = {
			agentId: "waifu-demo-partial",
			source: "token.migrated",
			data: {
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				tokenAddress: "0x0000000000000000000000000000000000000004",
				chain: "bsc",
				chainId: 56,
				tokenName: "Partial Worker Waifu",
				tokenTicker: "PART",
				launchType: "native",
			},
		};
		const result = (await processor({ id: "job-partial", data: payload, attemptsMade: 0 } as never)) as {
			cloudAgentId?: string;
			containerId?: string;
			webUiUrl?: string;
			status?: string;
		};

		assert.equal(result.cloudAgentId, "cloud-partial-1");
		assert.equal(result.containerId, "container-partial-1");
		assert.equal(result.webUiUrl, "https://partial-agent.example");
		assert.equal(result.status, "running");
	});

	assert.deepEqual(requests, ["https://elizacloud.ai/api/v1/agents/cloud-partial-1/status"]);
	assert.ok(
		updates.some(
			(update) =>
				update.values.elizaCloudAgentId === "cloud-partial-1" &&
				(update.values.metadata as { provisioning?: { webUiUrl?: string } }).provisioning?.webUiUrl ===
					"https://partial-agent.example",
		),
	);
	assert.ok(updates.some((update) => update.values.webUiUrl === "https://partial-agent.example"));
	assert.ok(inserts.some((insert) => insert.values.eventType === "agent.provisioned"));
});

test("agent-provisioning worker adopts Eliza Cloud existingAgentId conflicts", async () => {
	const updates: UpdateRecord[] = [];
	const inserts: InsertRecord[] = [];
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-01",
		name: "Worker Waifu",
		bio: "worker provision test",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Worker Waifu", symbol: "WORK" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const tokenRow = { id: "token-row-1", agentId: null };
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									if ("token" in fields) {
										return Promise.resolve([{ token: tokenRow, agent: null }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update(table: unknown) {
			return {
				set(values: Record<string, unknown>) {
					updates.push({ table, values });
					return { where: () => Promise.resolve() };
				},
			};
		},
		insert(table: unknown) {
			return {
				values(values: Record<string, unknown>) {
					inserts.push({ table, values });
					return {
						returning() {
							if ("eventType" in values) {
								return Promise.resolve([{ id: "event-row-1", ...values }]);
							}
							return Promise.resolve([{ id: "agent-overlay-1" }]);
						},
					};
				},
			};
		},
	} as never;
	const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
	mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		requests.push({ url: String(url), body });
		if (String(url).endsWith("/api/v1/agents")) {
			return Response.json(
				{
					error: "An agent is already linked to token 0x0000000000000000000000000000000000000004 on bsc",
					existingAgentId: "cloud-existing-conflict",
				},
				{ status: 409 },
			);
		}
		if (String(url).endsWith("/api/v1/agents/cloud-existing-conflict/status")) {
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "cloud-existing-conflict",
					containerId: "container-existing-conflict",
					webUiUrl: "https://conflict-agent.example",
					status: "running",
				},
			});
		}
		throw new Error(`unexpected fetch ${url}`);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-demo-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Worker Waifu",
					tokenTicker: "WORK",
					launchType: "native",
				},
			};
			const result = (await processor({ id: "job-conflict", data: payload, attemptsMade: 0 } as never)) as {
				cloudAgentId: string;
				containerId?: string;
				webUiUrl?: string;
				status: string;
			};
			assert.equal(result.cloudAgentId, "cloud-existing-conflict");
			assert.equal(result.containerId, "container-existing-conflict");
			assert.equal(result.webUiUrl, "https://conflict-agent.example");
			assert.equal(result.status, "running");
		},
	);

	assert.equal(requests.length, 2);
	assert.equal(requests[0]?.url, "https://cloud.test/api/v1/agents");
	assert.equal(requests[1]?.url, "https://cloud.test/api/v1/agents/cloud-existing-conflict/status");
	assert.ok(updates.some((update) => update.values.elizaCloudAgentId === "cloud-existing-conflict"));
	assert.ok(inserts.some((insert) => insert.values.cloudAgentId === "cloud-existing-conflict"));
	assert.ok(
		inserts.some(
			(insert) =>
				insert.values.eventType === "agent.provisioned" &&
				(insert.values.data as { runtimeAgentId?: string }).runtimeAgentId === "cloud-existing-conflict",
		),
	);
});

test("agent-provisioning worker does not adopt duplicate token conflicts without a cloud agent id", async () => {
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-01",
		name: "Worker Waifu",
		bio: "worker provision test",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Worker Waifu", symbol: "WORK" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			throw new Error("duplicate character conflict must not write runtime metadata");
		},
		insert() {
			throw new Error("duplicate character conflict must not emit provisioned events");
		},
	} as never;
	const requests: string[] = [];
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		requests.push(String(url));
		return Response.json(
			{
				error: "An agent is already linked to token 0x0000000000000000000000000000000000000004 on bsc",
				existingCharacterId: "character-existing-conflict",
			},
			{ status: 409 },
		);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-demo-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Worker Waifu",
					tokenTicker: "WORK",
					launchType: "native",
				},
			};
			await assert.rejects(
				() => processor({ id: "job-character-conflict", data: payload, attemptsMade: 0 } as never),
				/eliza-cloud POST \/api\/v1\/agents: 409/,
			);
		},
	);

	assert.deepEqual(requests, ["https://cloud.test/api/v1/agents"]);
});

test("agent-provisioning worker rejects invalid EVM wallets before calling Eliza Cloud", async () => {
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-01",
		name: "Worker Waifu",
		bio: "worker provision test",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Worker Waifu", symbol: "WORK" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) return Promise.resolve([{ walletAddress: "not-an-address" }]);
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		insert() {
			throw new Error("events should not be written before a valid wallet is resolved");
		},
	} as never;
	const fetchMock = mock.method(globalThis, "fetch", async () => {
		throw new Error("Eliza Cloud should not be called with an invalid agent wallet");
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-demo-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Worker Waifu",
					tokenTicker: "WORK",
					launchType: "native",
				},
			};
			await assert.rejects(
				() => processor({ id: "job-invalid-wallet", data: payload, attemptsMade: 0 } as never),
				/valid EVM address/,
			);
		},
	);

	assert.equal(fetchMock.mock.callCount(), 0);
});

test("agent-provisioning worker rejects invalid admin wallets before calling Eliza Cloud", async () => {
	const persona = {
		id: "persona-row-1",
		agentId: "waifu-demo-01",
		name: "Worker Waifu",
		bio: "worker provision test",
		avatarUrl: "https://example.com/a.png",
		ownerAddress: "not-an-address",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Worker Waifu", symbol: "WORK" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		insert() {
			throw new Error("events should not be written before a valid admin wallet is resolved");
		},
	} as never;
	const fetchMock = mock.method(globalThis, "fetch", async () => {
		throw new Error("Eliza Cloud should not be called with an invalid admin wallet");
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-demo-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Worker Waifu",
					tokenTicker: "WORK",
					launchType: "native",
				},
			};
			await assert.rejects(
				() => processor({ id: "job-invalid-admin-wallet", data: payload, attemptsMade: 0 } as never),
				/admin wallet.*valid EVM address/,
			);
		},
	);

	assert.equal(fetchMock.mock.callCount(), 0);
});

test("agent-provisioning worker surfaces a clear error when Eliza Cloud times out", async () => {
	const persona = {
		id: "persona-row-timeout",
		agentId: "waifu-timeout-01",
		name: "Timeout Waifu",
		bio: "provision timeout test",
		avatarUrl: null,
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Timeout Waifu", symbol: "TMO" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const db = {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return { set: () => ({ where: () => Promise.resolve() }) };
		},
		insert() {
			return { values: () => ({ returning: () => Promise.resolve([{ id: "event-row-timeout" }]) }) };
		},
	} as never;

	const fetchMock = mock.method(globalThis, "fetch", async () => {
		throw new DOMException("The operation timed out.", "TimeoutError");
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_CLOUD_REQUEST_TIMEOUT_MS: "1234",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-timeout-01",
				source: "token.migrated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Timeout Waifu",
					tokenTicker: "TMO",
					launchType: "native",
				},
			};
			await assert.rejects(
				() => processor({ id: "job-timeout", data: payload, attemptsMade: 0 } as never),
				/timed out after 1234ms/,
			);
		},
	);

	assert.equal(fetchMock.mock.callCount(), 1);
});

test("adaptivePollDelayMs ramps from the initial delay up to the cap", () => {
	// 1s initial, 5s cap: 1s → 2s → 4s → 5s (capped) → 5s …
	assert.equal(adaptivePollDelayMs(1, 1_000, 5_000), 1_000);
	assert.equal(adaptivePollDelayMs(2, 1_000, 5_000), 2_000);
	assert.equal(adaptivePollDelayMs(3, 1_000, 5_000), 4_000);
	assert.equal(adaptivePollDelayMs(4, 1_000, 5_000), 5_000);
	assert.equal(adaptivePollDelayMs(8, 1_000, 5_000), 5_000);
	// initial >= cap collapses to a fixed cadence at the cap.
	assert.equal(adaptivePollDelayMs(1, 5_000, 5_000), 5_000);
	assert.equal(adaptivePollDelayMs(3, 5_000, 5_000), 5_000);
});

function statusPollDb() {
	const persona = {
		id: "persona-row-poll",
		agentId: "waifu-poll-01",
		name: "Poll Waifu",
		bio: "status poll resilience",
		avatarUrl: null,
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Poll Waifu", symbol: "POLL" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const tokenRow = { id: "token-row-poll", agentId: "agent-overlay-poll" };
	return {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (!fields) return Promise.resolve([persona]);
									if ("walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000009" }]);
									}
									if ("token" in fields) return Promise.resolve([{ token: tokenRow, agent: null }]);
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return { set: () => ({ where: () => Promise.resolve() }) };
		},
		insert() {
			return { values: () => ({ returning: () => Promise.resolve([{ id: "row-poll" }]) }) };
		},
	} as never;
}

const pollPayload: AgentProvisioningJob = {
	agentId: "waifu-poll-01",
	source: "token.migrated",
	data: {
		tokenContractAddress: "0x0000000000000000000000000000000000000004",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		tokenName: "Poll Waifu",
		tokenTicker: "POLL",
		launchType: "native",
	},
};

test("agent-provisioning worker keeps polling through a transient status blip", async () => {
	let statusPolls = 0;
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		const target = String(url);
		if (target.endsWith("/api/v1/agents")) {
			return Response.json({ success: true, data: { cloudAgentId: "cloud-poll-1", status: "pending" } });
		}
		if (target.includes("/status")) {
			statusPolls += 1;
			if (statusPolls === 1) return new Response("upstream hiccup", { status: 503 });
			return Response.json({
				success: true,
				data: { cloudAgentId: "cloud-poll-1", status: "running", webUiUrl: "https://poll-agent.example" },
			});
		}
		throw new Error(`unexpected fetch ${target}`);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db: statusPollDb(),
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			const result = await processor({ id: "job-poll-transient", data: pollPayload, attemptsMade: 0 } as never);
			assert.equal((result as { webUiUrl?: string }).webUiUrl, "https://poll-agent.example");
		},
	);

	assert.equal(statusPolls, 2);
});

test("agent-provisioning worker fails fast when the status endpoint rejects auth", async () => {
	let statusPolls = 0;
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		const target = String(url);
		if (target.endsWith("/api/v1/agents")) {
			return Response.json({ success: true, data: { cloudAgentId: "cloud-poll-2", status: "pending" } });
		}
		if (target.includes("/status")) {
			statusPolls += 1;
			return new Response("forbidden", { status: 401 });
		}
		throw new Error(`unexpected fetch ${target}`);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_ATTEMPTS: "18",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db: statusPollDb(),
				logger: console as never,
				startedAt: new Date("2026-05-27T00:00:00Z"),
				chainId: 56,
			});
			await assert.rejects(
				() => processor({ id: "job-poll-auth", data: pollPayload, attemptsMade: 0 } as never),
				/401/,
			);
		},
	);

	// Auth failures are not retried inside the poll loop.
	assert.equal(statusPolls, 1);
});
