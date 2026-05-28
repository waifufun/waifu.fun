import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { AgentProvisioningJob } from "@waifufun/queue/jobs";

import { createAgentProvisioningProcessor } from "./agent-provisioning.js";

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

	const requests: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
	mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		requests.push({ url: String(url), body, headers: init?.headers as Record<string, string> });
		if (String(url).endsWith("/api/v1/agents")) {
			return Response.json({
				success: true,
				data: {
					cloudAgentId: "123e4567-e89b-12d3-a456-426614174000",
					characterId: "character-worker",
					status: "running",
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
		throw new Error(`unexpected fetch ${url}`);
	});

	await withEnv(
		{
			ELIZA_CLOUD_BASE_URL: "https://cloud.test",
			ELIZA_CLOUD_SERVICE_KEY: "svc_worker",
			ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI: "ecr.test/waifu-agent:latest",
			WAIFU_CHAT_ACCESS_JWT_SECRET: "chat_secret_worker",
			WAIFU_ELIZA_DEFAULT_MODEL: "openai/gpt-oss-120b",
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
				source: "agent.graduated",
				data: {
					tokenContractAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					chainId: 56,
					tokenName: "Worker Waifu",
					tokenTicker: "WORK",
				},
			};
			const result = await processor({ id: "job-1", data: payload, attemptsMade: 0 } as never);
			assert.deepEqual(result, {
				agentId: "waifu-demo-01",
				cloudAgentId: "123e4567-e89b-12d3-a456-426614174000",
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

	assert.equal(requests.length, 1);
	assert.equal(requests[0]?.headers["X-Service-Key"], "svc_worker");
	assert.equal(requests[0]?.headers["X-API-Key"], "svc_worker");
	assert.equal(requests[0]?.body.tokenContractAddress, "0x0000000000000000000000000000000000000004");
	assert.equal(requests[0]?.body.chain, "bsc");
	assert.equal(requests[0]?.body.tokenName, "Worker Waifu");
	assert.equal(requests[0]?.body.tokenTicker, "WORK");
	assert.deepEqual(requests[0]?.body.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		chainType: "evm",
	});
	const character = requests[0]?.body.character as Record<string, unknown>;
	assert.deepEqual((character.config as Record<string, unknown>).account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:waifu-demo-01",
	});
	assert.deepEqual(requests[0]?.body.billing, {
		mode: "owner_credits",
		initialReserveUsd: 5,
	});
	assert.deepEqual(requests[0]?.body.access, {
		guestTokenThreshold: 1000,
		userTokenThreshold: 100000,
		adminWalletAddress: "0x0000000000000000000000000000000000000002",
		roles: {
			guest: { minTokens: 1000, comparison: "gt" },
			user: { minTokens: 100000, comparison: "gt" },
			admin: { wallets: ["0x0000000000000000000000000000000000000002"] },
		},
	});

	const container = requests[0]?.body.container as Record<string, unknown>;
	assert.equal(container.image, "ecr.test/waifu-agent:latest");
	const env = container.env as Record<string, string>;
	assert.equal(env.WAIFU_AGENT_EVM_ADDRESS, "0x0000000000000000000000000000000000000009");
	assert.equal(env.WAIFU_AGENT_EVM_KEY_REF, "steward:waifu-demo-01");
	assert.equal(env.WAIFU_CHAT_ACCESS_JWT_SECRET, "chat_secret_worker");
	assert.equal(env.WAIFU_INITIAL_CREDIT_USD, "5");
	assert.equal(env.WAIFU_ACCESS_GUEST_MIN_TOKENS, "1000");
	assert.equal(env.WAIFU_ACCESS_USER_MIN_TOKENS, "100000");
	assert.equal(env.WAIFU_ACCESS_THRESHOLD_MODE, "strict_gt");
	assert.equal(env.WAIFU_ACCESS_ADMIN_WALLETS, "0x0000000000000000000000000000000000000002");

	assert.equal(returningAgents.length, 1);
	assert.ok(updates.some((update) => update.values.runtimeKind === "eliza-cloud"));
	assert.ok(
		updates.some((update) => update.values.agentStatus === "running" && update.values.ownerClaimStatus === "claimed"),
	);
	assert.ok(inserts.some((insert) => insert.values.cloudAgentId === "123e4567-e89b-12d3-a456-426614174000"));
	assert.ok(inserts.some((insert) => insert.values.eventType === "agent.provisioned"));
});
