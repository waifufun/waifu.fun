import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { AgentProvisioningJob } from "@waifufun/queue/jobs";

import { createAgentProvisioningProcessor } from "./agent-provisioning.js";

type UpdateRecord = { table: unknown; values: Record<string, unknown> };
type InsertRecord = { table: unknown; values: Record<string, unknown> };

/**
 * A resolved update result that is awaitable (for callers that do not chain
 * .returning()) and also exposes .returning() for the atomic provisioning claim
 * / release UPDATEs. Returning a real Promise with .returning attached keeps the
 * mock awaitable without an object `then` property.
 */
function updateResult(rows: Array<Record<string, unknown>>): Promise<void> & {
	returning: () => Promise<Array<Record<string, unknown>>>;
} {
	const promise = Promise.resolve() as Promise<void> & {
		returning: () => Promise<Array<Record<string, unknown>>>;
	};
	promise.returning = () => Promise.resolve(rows);
	return promise;
}

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
					const chain = {
						where() {
							// The atomic provisioning claim calls .returning(); a single-
							// worker happy path always wins the claim, so return one row.
							return updateResult([{ agentId: persona.agentId }]);
						},
					};
					return chain;
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
					poolAddress: "0x0000000000000000000000000000000000000008",
					dexName: "pancakeswap",
				},
			};
			const result = await processor({ id: "job-1", data: payload, attemptsMade: 0 } as never);
			assert.deepEqual(result, {
				agentId: "waifu-demo-01",
				cloudAgentId: "123e4567-e89b-12d3-a456-426614174000",
				containerId: "container-worker",
				containerUrl: "https://worker-agent.example",
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
	assert.equal(container.image, "ecr.test/waifu-agent:latest");
	const env = container.env as Record<string, string>;
	assert.equal(env.WAIFU_AGENT_EVM_ADDRESS, "0x0000000000000000000000000000000000000009");
	assert.equal(env.WAIFU_AGENT_EVM_KEY_REF, "steward:custom-worker-key");
	assert.equal(env.ELIZA_UI_ENABLE, "true");
	assert.equal(env.WAIFU_CHAT_ACCESS_JWT_SECRET, "chat_secret_worker");
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
					return {
						where() {
							// claimProvisioning awaits .returning(); other updates await the
							// statement directly. Support both: a thenable that also exposes
							// .returning() winning the single-worker claim.
							return updateResult([{ agentId: persona.agentId }]);
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
			return {
				set() {
					return {
						where() {
							return updateResult([{ agentId: "agent-final-no-url" }]);
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
		containerUrl: "https://existing-agent.example",
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
					return {
						where() {
							// claimProvisioning awaits .returning(); other updates await the
							// statement directly. Support both: a thenable that also exposes
							// .returning() winning the single-worker claim.
							return updateResult([{ agentId: persona.agentId }]);
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
			// The atomic claim (and its best-effort release on the failing POST) write a
			// transient provisioning claim, not runtime metadata. Allow those: the 409
			// without an existingAgentId still aborts before storeProvisioningMetadata,
			// so no runtime metadata is ever written and no provisioned event emitted.
			return {
				set(values: Record<string, unknown>) {
					if ("runtimeKind" in values || "elizaCloudAgentId" in values) {
						throw new Error("duplicate character conflict must not write runtime metadata");
					}
					return {
						where() {
							return updateResult([{ agentId: persona.agentId }]);
						},
					};
				},
			};
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

test("worker provisioning injects WAIFU_INFERENCE_WEBHOOK_URL and WAIFU_WEBHOOK_SECRET into container env", async () => {
	const persona = {
		id: "persona-row-2",
		agentId: "waifu-meter-01",
		name: "Meter Waifu",
		bio: null,
		avatarUrl: null,
		systemPrompt: null,
		claimedByXHandle: null,
		twitterHandle: null,
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Meter Waifu", symbol: "METR" },
		metadata: {},
		runtimeKind: "webhook",
	};
	const tokenRow = { id: "token-row-2", agentId: null };
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
		update() {
			return {
				set() {
					return {
						where() {
							return updateResult([{ agentId: persona.agentId }]);
						},
					};
				},
			};
		},
		insert() {
			return {
				values(values: Record<string, unknown>) {
					return {
						returning() {
							if ("eventType" in values) {
								return Promise.resolve([{ id: "event-row-2", ...values, createdAt: new Date() }]);
							}
							return Promise.resolve([{ id: "agent-overlay-2" }]);
						},
					};
				},
			};
		},
	} as never;

	let capturedEnv: Record<string, string> = {};
	mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		// Develop polls /status after the POST, so branch on the URL and only parse
		// a JSON body for the creating POST. The status poll must surface a webUiUrl
		// so assertHostedChatUrlReady is satisfied.
		if (String(url).endsWith("/api/v1/agents/223e4567-e89b-12d3-a456-426614174000/status")) {
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "223e4567-e89b-12d3-a456-426614174000",
					webUiUrl: "https://meter-agent.example",
					status: "running",
				},
			});
		}
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		const container = body.container as Record<string, unknown> | undefined;
		if (container) capturedEnv = container.env as Record<string, string>;
		return Response.json({
			success: true,
			data: {
				cloudAgentId: "223e4567-e89b-12d3-a456-426614174000",
				webUiUrl: "https://meter-agent.example",
				status: "running",
				jobId: "job-meter",
			},
		});
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_meter",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_API_BASE_URL: "https://api.waifu.fun",
			WEBHOOK_RECEIVER_SECRET: "shared_webhook_secret",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date(),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-meter-01",
				source: "agent.launched",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Meter Waifu",
					tokenTicker: "METR",
				},
			};
			await processor({ id: "job-meter-1", data: payload, attemptsMade: 0 } as never);
		},
	);

	mock.restoreAll();

	// Blocker 3: launch-time (worker) containers must carry the metering knobs
	// so plugin-elizacloud emits inference.spent events.
	assert.equal(capturedEnv.WAIFU_INFERENCE_WEBHOOK_URL, "https://api.waifu.fun/v2/webhooks/eliza-cloud/inference");
	assert.equal(capturedEnv.WAIFU_WEBHOOK_SECRET, "shared_webhook_secret");
	// And the inference URL must never be the credits URL.
	assert.notEqual(capturedEnv.WAIFU_INFERENCE_WEBHOOK_URL, capturedEnv.WAIFU_WEBHOOK_URL);
	assert.ok(!capturedEnv.WAIFU_INFERENCE_WEBHOOK_URL.endsWith("/credits"));
});

test("two concurrent provisions for the same persona result in exactly one /api/v1/agents POST", async () => {
	const persona = {
		id: "persona-row-3",
		agentId: "waifu-race-01",
		name: "Race Waifu",
		bio: null,
		avatarUrl: null,
		systemPrompt: null,
		claimedByXHandle: null,
		twitterHandle: null,
		ownerAddress: "0x0000000000000000000000000000000000000002",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		prelaunchParams: { name: "Race Waifu", symbol: "RACE" },
		metadata: {} as Record<string, unknown>,
		runtimeKind: "webhook",
	};
	const tokenRow = { id: "token-row-3", agentId: null };

	// Simulate the atomic claim: the FIRST conditional UPDATE that matches wins
	// (returns a row); any later claim attempt sees the claim already held and
	// matches zero rows. This models Postgres row-locking on the conditional
	// UPDATE so we can prove only one job proceeds to POST.
	let claimHeld = false;
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
		update() {
			return {
				set(values: Record<string, unknown>) {
					return {
						where() {
							// Only the claim UPDATE (which sets metadata to an in_progress
							// claim) participates in the race. The first caller wins; any
							// later claim attempt sees the claim already held and matches
							// zero rows (loses).
							const isClaim = typeof values.metadata === "object" || values.metadata !== undefined;
							if (isClaim && !claimHeld) {
								claimHeld = true;
								return updateResult([{ agentId: persona.agentId }]);
							}
							if (isClaim && claimHeld) {
								return updateResult([]);
							}
							return updateResult([{ agentId: persona.agentId }]);
						},
					};
				},
			};
		},
		insert() {
			return {
				values(values: Record<string, unknown>) {
					return {
						returning() {
							if ("eventType" in values) {
								return Promise.resolve([{ id: "event-row-3", ...values, createdAt: new Date() }]);
							}
							return Promise.resolve([{ id: "agent-overlay-3" }]);
						},
					};
				},
			};
		},
	} as never;

	let postCount = 0;
	mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
		// The winner polls /status after the POST (develop flow); surface a webUiUrl
		// so assertHostedChatUrlReady passes. Only count the POST to /api/v1/agents.
		if (String(url).endsWith("/api/v1/agents/323e4567-e89b-12d3-a456-426614174000/status")) {
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "323e4567-e89b-12d3-a456-426614174000",
					webUiUrl: "https://race-agent.example",
					status: "running",
				},
			});
		}
		if (String(url).endsWith("/api/v1/agents")) {
			postCount += 1;
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "323e4567-e89b-12d3-a456-426614174000",
					webUiUrl: "https://race-agent.example",
					status: "running",
					jobId: "job-race",
				},
			});
		}
		throw new Error(`unexpected fetch ${url}`);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_race",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_ELIZA_PROVISION_STATUS_POLL_INTERVAL_MS: "0",
		},
		async () => {
			const processor = createAgentProvisioningProcessor({
				db,
				logger: console as never,
				startedAt: new Date(),
				chainId: 56,
			});
			const payload: AgentProvisioningJob = {
				agentId: "waifu-race-01",
				source: "agent.launched",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Race Waifu",
					tokenTicker: "RACE",
				},
			};
			// Run both jobs concurrently. The loser throws "already in progress".
			const results = await Promise.allSettled([
				processor({ id: "job-race-create", data: payload, attemptsMade: 0 } as never),
				processor({ id: "job-race-graduate", data: payload, attemptsMade: 0 } as never),
			]);
			const fulfilled = results.filter((r) => r.status === "fulfilled");
			const rejected = results.filter((r) => r.status === "rejected");
			assert.equal(fulfilled.length, 1, "exactly one provision should succeed");
			assert.equal(rejected.length, 1, "the loser should be rejected, not POST a duplicate");
		},
	);

	mock.restoreAll();

	// Blocker 4: only one container POST regardless of the two concurrent jobs.
	assert.equal(postCount, 1);
});
