import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db/client";
import { Hono } from "hono";
import { jwtVerify } from "jose";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../middleware/patron-auth.js";
import app, {
	__setOwnerTokenChatAccessDepsForTest,
	__setOwnerTokenDbForTest,
	__setOwnerTokenElizaClientForTest,
	type TokenRuntimeRow,
	resolveTokenChatAccess,
	topUpOwnedTokenRuntime,
} from "./owner-tokens.js";

test("topUpOwnedTokenRuntime creates organization credit checkout and marks runtime pending payment", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const toppedUp: Array<{ agentId: string; amount: number }> = [];
	const db = {
		update() {
			return {
				set(values: Record<string, unknown>) {
					updates.push(values);
					return {
						where() {
							return Promise.resolve();
						},
					};
				},
			};
		},
	} as unknown as Database;
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			agentStatus: "suspended",
			ownerClaimStatus: "claimed",
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-agent-1",
			agentStatus: "suspended",
			lifecycleState: "dormant",
			webUiUrl: "https://agent.example",
			bridgeUrl: "container-1",
			billingMode: "owner_credits",
			infraReserveUsd: "2.5",
		},
		persona: {
			agentId: "waifu-demo-01",
			metadata: { provisioning: { cloudAgentId: "cloud-agent-1", containerId: "container-1" } },
		},
	} as unknown as TokenRuntimeRow;

	const result = await topUpOwnedTokenRuntime(
		db,
		row,
		{ amountUsdCents: 500 },
		{
			async topUpCredits(agentId, amount) {
				toppedUp.push({ agentId, amount });
				return { url: "https://checkout.example/org" };
			},
		},
	);

	assert.deepEqual(result, {
		creditsAmount: 500,
		containerId: "container-1",
		checkout: { url: "https://checkout.example/org" },
		checkoutUrl: "https://checkout.example/org",
	});
	assert.deepEqual(toppedUp, [{ agentId: "cloud-agent-1", amount: 5 }]);
	assert.equal(updates.length, 3);
	assert.equal(updates[0]?.agentStatus, "suspended");
	assert.equal(updates[0]?.lifecycleState, "dormant");
	assert.equal(updates[0]?.infraReserveUsd, "2.5");
	assert.equal(updates[0]?.suspendedReason, "credits_checkout_pending");
	assert.equal(updates[1]?.agentStatus, "suspended");
	assert.equal(updates[2]?.elizaCloudAgentId, "cloud-agent-1");
});

test("topUpOwnedTokenRuntime requires a provisioned Eliza Cloud agent id", async () => {
	const db = {
		update() {
			throw new Error("db should not be touched");
		},
	} as unknown as Database;
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			agentStatus: "none",
		},
		agent: null,
		persona: { agentId: "waifu-local-agent", metadata: {} },
	} as unknown as TokenRuntimeRow;

	await assert.rejects(
		() =>
			topUpOwnedTokenRuntime(
				db,
				row,
				{ amountUsdCents: 500 },
				{
					async topUpCredits() {
						throw new Error("top-up should not be called without a cloud agent");
					},
				},
			),
		/RUNTIME_NOT_FOUND/,
	);
});

test("resolveTokenChatAccess maps creator and holder balances to admin, user, guest, or denied roles", async () => {
	const row = {
		token: {
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			creatorAddress: "0x0000000000000000000000000000000000000001",
		},
		agent: null,
		persona: { ownerAddress: null },
	} as unknown as TokenRuntimeRow;

	assert.deepEqual(await resolveTokenChatAccess(row, "0x0000000000000000000000000000000000000001"), {
		role: "admin",
		balanceTokens: Number.POSITIVE_INFINITY,
	});

	const withBalance = (tokens: bigint) => ({
		readTokenBalance: async () => ({ balance: tokens * 10n ** 18n, decimals: 18 }),
	});
	assert.deepEqual(
		await resolveTokenChatAccess(row, "0x0000000000000000000000000000000000000002", withBalance(100_001n)),
		{
			role: "user",
			balanceTokens: 100_001,
		},
	);
	assert.deepEqual(
		await resolveTokenChatAccess(row, "0x0000000000000000000000000000000000000002", withBalance(100_000n)),
		{
			role: "guest",
			balanceTokens: 100_000,
		},
	);
	assert.deepEqual(
		await resolveTokenChatAccess(row, "0x0000000000000000000000000000000000000002", withBalance(1_001n)),
		{
			role: "guest",
			balanceTokens: 1_001,
		},
	);
	assert.deepEqual(
		await resolveTokenChatAccess(row, "0x0000000000000000000000000000000000000002", withBalance(1_000n)),
		{
			role: null,
			balanceTokens: 1_000,
		},
	);
});

test("POST runtime/activate provisions with the agent EVM wallet and stores the hosted web UI URL", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const provisioned: Array<Record<string, unknown>> = [];
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "none",
			ownerClaimStatus: "claimed",
			name: "Activation Waifu",
			ticker: "ACT",
			description: "Hosted activation test",
			imageUrl: null,
			isImported: false,
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: null,
			agentStatus: "none",
			lifecycleState: "birth",
			webUiUrl: null,
			bridgeUrl: null,
			billingMode: "owner_credits",
			infraReserveUsd: "0",
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-activate-01",
			ownerAddress: "0x0000000000000000000000000000000000000001",
			metadata: {},
		},
	} as unknown as TokenRuntimeRow;
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
									if (fields && "walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000002" }]);
									}
									return Promise.resolve([row]);
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
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "creator@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setOwnerTokenElizaClientForTest({
		async provisionAgent() {
			return { containerId: "unused-container" };
		},
		async provisionWaifuAgent(input) {
			provisioned.push(input as unknown as Record<string, unknown>);
			return {
				agentId: input.agentId,
				cloudAgentId: "cloud-agent-activate",
				containerId: "container-activate",
				containerUrl: "http://bridge.internal",
				webUiUrl: "https://hosted-agent.example",
				status: "running",
			};
		},
		async pauseAgent() {},
		async resumeAgent() {},
		async deprovisionAgent() {},
		async topUpCredits() {
			return undefined;
		},
	});

	try {
		const res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/runtime/activate", {
			method: "POST",
			headers: { authorization: "Bearer steward", "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		assert.equal(res.status, 200, await res.clone().text());
		const json = (await res.json()) as { success: boolean; cloud?: { webUiUrl?: string } };
		assert.equal(json.success, true);
		assert.equal(json.cloud?.webUiUrl, "https://hosted-agent.example");
		assert.equal(provisioned.length, 1);
		const provision = provisioned[0] as {
			account?: { primaryWalletAddress?: string; walletKeyRef?: string };
			access?: { adminWallets?: string[] };
			billing?: { initialReserveUsd?: number };
		};
		assert.equal(provision.account?.primaryWalletAddress, "0x0000000000000000000000000000000000000002");
		assert.equal(provision.account?.walletKeyRef, "steward:waifu-activate-01");
		assert.deepEqual(provision.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
		assert.equal(provision.billing?.initialReserveUsd, 5);
		assert.equal(updates[2]?.cloudAgentId, "cloud-agent-activate");
		assert.equal(updates[2]?.webUiUrl, "https://hosted-agent.example");
		assert.equal(updates[2]?.bridgeUrl, "container-activate");
		assert.equal(updates[2]?.agentStatus, "running");
		const personaUpdate = updates.find((update) => update.elizaCloudAgentId === "cloud-agent-activate");
		assert.equal(personaUpdate?.elizaCloudAgentId, "cloud-agent-activate");
		assert.equal(
			((personaUpdate?.metadata as { provisioning?: { cloudAgentId?: string } })?.provisioning ?? {}).cloudAgentId,
			"cloud-agent-activate",
		);
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenElizaClientForTest(undefined);
	}
});

test("POST runtime/activate keeps owner token runtime provisioning when hosted URL is missing", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "none",
			ownerClaimStatus: "claimed",
			name: "Activation Waifu",
			ticker: "ACT",
			description: "Hosted activation test",
			imageUrl: null,
			isImported: false,
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: null,
			agentStatus: "none",
			lifecycleState: "birth",
			webUiUrl: null,
			bridgeUrl: null,
			billingMode: "owner_credits",
			infraReserveUsd: "0",
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-activate-01",
			ownerAddress: "0x0000000000000000000000000000000000000001",
			metadata: {},
		},
	} as unknown as TokenRuntimeRow;
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
									if (fields && "walletAddress" in fields) {
										return Promise.resolve([{ walletAddress: "0x0000000000000000000000000000000000000002" }]);
									}
									return Promise.resolve([row]);
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
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "creator@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setOwnerTokenElizaClientForTest({
		async provisionAgent() {
			return { containerId: "unused-container" };
		},
		async provisionWaifuAgent(input) {
			return {
				agentId: input.agentId,
				cloudAgentId: "cloud-agent-activate",
				containerId: "container-activate",
				status: "running",
			};
		},
		async pauseAgent() {},
		async resumeAgent() {},
		async deprovisionAgent() {},
		async topUpCredits() {
			return undefined;
		},
	});

	try {
		const res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/runtime/activate", {
			method: "POST",
			headers: { authorization: "Bearer steward", "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		assert.equal(res.status, 200, await res.clone().text());
		const json = (await res.json()) as { success: boolean };
		assert.equal(json.success, true);
		assert.equal(updates[2]?.cloudAgentId, "cloud-agent-activate");
		assert.equal(updates[2]?.webUiUrl, null);
		assert.equal(updates[2]?.bridgeUrl, "container-activate");
		assert.equal(updates[2]?.agentStatus, "provisioning");
		assert.equal(updates[2]?.lifecycleState, "birth");
		const personaUpdate = updates.find((update) => update.elizaCloudAgentId === "cloud-agent-activate");
		assert.equal(personaUpdate?.elizaCloudAgentId, "cloud-agent-activate");
		assert.equal(
			((personaUpdate?.metadata as { provisioning?: { status?: string; webUiUrl?: string | null } })?.provisioning ?? {})
				.status,
			"provisioning",
		);
		assert.equal(
			((personaUpdate?.metadata as { provisioning?: { status?: string; webUiUrl?: string | null } })?.provisioning ?? {})
				.webUiUrl,
			null,
		);
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenElizaClientForTest(undefined);
	}
});

test("POST runtime/restart restarts the owner token Cloud agent", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const paused: string[] = [];
	const resumed: string[] = [];
	const restarted: string[] = [];
	const statusChecks: string[] = [];
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "running",
			ownerClaimStatus: "claimed",
			name: "Chat Waifu",
			description: null,
			imageUrl: null,
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-agent-1",
			agentStatus: "running",
			lifecycleState: "live",
			webUiUrl: "https://agent.example",
			bridgeUrl: "container-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-demo-01",
			ownerAddress: "0x0000000000000000000000000000000000000001",
			metadata: { provisioning: { cloudAgentId: "cloud-agent-1", containerId: "container-1" } },
		},
	} as unknown as TokenRuntimeRow;
	const db = {
		select() {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									return Promise.resolve([row]);
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
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "creator@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setOwnerTokenElizaClientForTest({
		async provisionAgent() {
			return { containerId: "container-1" };
		},
		async pauseAgent(agentId) {
			paused.push(agentId);
		},
		async resumeAgent(agentId) {
			resumed.push(agentId);
		},
		async restartHostedAgent(agentId) {
			restarted.push(agentId);
		},
		async getAgentRuntimeStatus(agentId) {
			statusChecks.push(agentId);
			return {
				cloudAgentId: agentId,
				containerId: "container-after-restart",
				webUiUrl: "https://agent-after-restart.example",
				status: "running",
			};
		},
		async deprovisionAgent() {},
		async topUpCredits() {
			return undefined;
		},
	});

	try {
		const res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/runtime/restart", {
			method: "POST",
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200, await res.clone().text());
		const json = (await res.json()) as { success: boolean; runtime?: { agentStatus?: string } };
		assert.equal(json.success, true);
		assert.equal(json.runtime?.agentStatus, "running");
		assert.deepEqual(paused, []);
		assert.deepEqual(resumed, []);
		assert.deepEqual(restarted, ["cloud-agent-1"]);
		assert.deepEqual(statusChecks, ["cloud-agent-1"]);
		assert.equal(updates[0]?.agentStatus, "running");
		assert.equal(updates[0]?.lifecycleState, "live");
		assert.equal(updates[0]?.cloudAgentId, "cloud-agent-1");
		assert.equal(updates[0]?.bridgeUrl, "container-after-restart");
		assert.equal(updates[0]?.webUiUrl, "https://agent-after-restart.example");
		assert.equal(updates[0]?.suspendedReason, null);
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenElizaClientForTest(undefined);
	}
});

test("POST runtime/restart keeps owner token runtime provisioning when hosted URL is missing", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "provisioning",
			ownerClaimStatus: "claimed",
			name: "Chat Waifu",
			description: null,
			imageUrl: null,
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-agent-1",
			agentStatus: "provisioning",
			lifecycleState: "birth",
			webUiUrl: null,
			bridgeUrl: "container-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-demo-01",
			ownerAddress: "0x0000000000000000000000000000000000000001",
			metadata: { provisioning: { cloudAgentId: "cloud-agent-1", containerId: "container-1" } },
		},
	} as unknown as TokenRuntimeRow;
	const db = {
		select() {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									return Promise.resolve([row]);
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
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "creator@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setOwnerTokenElizaClientForTest({
		async provisionAgent() {
			return { containerId: "container-1" };
		},
		async pauseAgent() {},
		async resumeAgent() {},
		async restartHostedAgent() {},
		async getAgentRuntimeStatus(agentId) {
			return {
				cloudAgentId: agentId,
				containerId: "container-after-restart",
				status: "running",
			};
		},
		async deprovisionAgent() {},
		async topUpCredits() {
			return undefined;
		},
	});

	try {
		const res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/runtime/restart", {
			method: "POST",
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200, await res.clone().text());
		const json = (await res.json()) as { success: boolean; runtime?: { agentStatus?: string } };
		assert.equal(json.success, true);
		assert.equal(json.runtime?.agentStatus, "provisioning");
		assert.equal(updates[0]?.agentStatus, "provisioning");
		assert.equal(updates[0]?.lifecycleState, "birth");
		assert.equal(updates[0]?.webUiUrl, null);
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenElizaClientForTest(undefined);
	}
});

test("GET chat-session issues a role-scoped Eliza Cloud chat URL for token holders", async () => {
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			name: "Chat Waifu",
			ticker: "CHAT",
			imageUrl: null,
			description: null,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "running",
			ownerClaimStatus: "claimed",
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-chat-1",
			agentStatus: "running",
			lifecycleState: "live",
			webUiUrl: "https://chat.example/agent",
			bridgeUrl: "container-chat-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			lastHeartbeatAt: null,
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-chat-01",
			ownerAddress: null,
			metadata: { provisioning: { cloudAgentId: "cloud-chat-1", containerId: "container-chat-1" } },
		},
	} as unknown as TokenRuntimeRow;
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
									if (fields && "token" in fields) return Promise.resolve([row]);
									return Promise.resolve([
										{
											id: "patron-row-1",
											stewardUserId: "steward-user-1",
											primaryEmail: "holder@example.com",
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db as never);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "holder@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000002", chainNamespace: "evm" }],
	}));
	__setOwnerTokenChatAccessDepsForTest({
		signingSecret: "chat-secret",
		now: () => new Date("2026-05-27T12:00:00.000Z"),
		readTokenBalance: async () => ({ balance: 100_001n * 10n ** 18n, decimals: 18 }),
	});

	try {
		const res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200);
		const json = (await res.json()) as {
			success: boolean;
			chatUrl: string;
			role: string;
			balanceTokens: number;
		};
		assert.equal(json.success, true);
		assert.equal(json.role, "user");
		assert.equal(json.balanceTokens, 100_001);

		const url = new URL(json.chatUrl);
		assert.equal(url.origin, "https://chat.example");
		const token = url.searchParams.get("waifu_access_token");
		assert.ok(token);
		const verified = await jwtVerify(token, new TextEncoder().encode("chat-secret"), {
			issuer: "waifu.fun",
			audience: "eliza-cloud-chat",
			currentDate: new Date("2026-05-27T12:05:00.000Z"),
		});
		assert.equal(verified.payload.role, "user");
		assert.equal(verified.payload.walletAddress, "0x0000000000000000000000000000000000000002");
		assert.equal(verified.payload.tokenAddress, "0x0000000000000000000000000000000000000004");
		assert.equal(verified.payload.cloudAgentId, "cloud-chat-1");
		assert.equal(verified.payload.thresholdMode, "strict_gt");
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenChatAccessDepsForTest({});
	}
});

test("GET chat-session enforces strict holder thresholds at route boundary", async () => {
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			name: "Boundary Chat Waifu",
			ticker: "BOUND",
			imageUrl: null,
			description: null,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "running",
			ownerClaimStatus: "claimed",
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-boundary-chat-1",
			agentStatus: "running",
			lifecycleState: "live",
			webUiUrl: "https://chat.example/boundary-agent",
			bridgeUrl: "container-boundary-chat-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			lastHeartbeatAt: null,
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-boundary-chat-01",
			ownerAddress: null,
			metadata: { provisioning: { cloudAgentId: "cloud-boundary-chat-1", containerId: "container-boundary-chat-1" } },
		},
	} as unknown as TokenRuntimeRow;
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
									if (fields && "token" in fields) return Promise.resolve([row]);
									return Promise.resolve([
										{
											id: "patron-row-1",
											stewardUserId: "steward-user-1",
											primaryEmail: "holder@example.com",
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;
	let balance = 1_000n * 10n ** 18n;

	__setRequirePatronDbForTest(db as never);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "holder@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000002", chainNamespace: "evm" }],
	}));
	__setOwnerTokenChatAccessDepsForTest({
		signingSecret: "chat-secret",
		now: () => new Date("2026-05-27T12:00:00.000Z"),
		readTokenBalance: async () => ({ balance, decimals: 18 }),
	});

	try {
		type ChatSessionBody = {
			error?: string;
			role?: string;
			balanceTokens?: number;
			requiredTokens?: number;
			thresholdMode?: string;
			chatUrl?: string;
		};
		let res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 403, await res.clone().text());
		let json = (await res.json()) as ChatSessionBody;
		assert.equal(json.error, "INSUFFICIENT_TOKEN_BALANCE");
		assert.equal(json.balanceTokens, 1_000);
		assert.equal(json.requiredTokens, 1_000);
		assert.equal(json.thresholdMode, "strict_gt");

		balance = 100_000n * 10n ** 18n;
		res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200, await res.clone().text());
		json = (await res.json()) as ChatSessionBody;
		assert.equal(json.role, "guest");
		assert.equal(json.balanceTokens, 100_000);
		assert.ok(json.chatUrl?.includes("waifu_access_token="));

		balance = 100_000n * 10n ** 18n + 1n;
		res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200, await res.clone().text());
		json = (await res.json()) as ChatSessionBody;
		assert.equal(json.role, "user");
		assert.ok(json.chatUrl?.includes("waifu_access_token="));
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenChatAccessDepsForTest({});
	}
});

test("GET chat-session requires a running hosted Cloud agent id and chat URL", async () => {
	const baseRow = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			name: "Partial Chat Waifu",
			ticker: "PART",
			imageUrl: null,
			description: null,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "running",
			ownerClaimStatus: "claimed",
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: null,
			agentStatus: "running",
			lifecycleState: "live",
			webUiUrl: "https://chat.example/partial-agent",
			bridgeUrl: "container-partial-chat-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			lastHeartbeatAt: null,
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-partial-chat-01",
			ownerAddress: null,
			metadata: { provisioning: { containerId: "container-partial-chat-1" } },
		},
	} as unknown as TokenRuntimeRow;
	let row = baseRow;
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
									if (fields && "token" in fields) return Promise.resolve([row]);
									return Promise.resolve([
										{
											id: "patron-row-1",
											stewardUserId: "steward-user-1",
											primaryEmail: "holder@example.com",
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db as never);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "holder@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000002", chainNamespace: "evm" }],
	}));
	__setOwnerTokenChatAccessDepsForTest({
		signingSecret: "chat-secret",
		readTokenBalance: async () => ({ balance: 100_001n * 10n ** 18n, decimals: 18 }),
	});

	try {
		let res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 409);
		let json = (await res.json()) as {
			error?: string;
			cloudAgentId?: string | null;
			hasChatUrl?: boolean;
			agentStatus?: string;
		};
		assert.equal(json.error, "CHAT_UNAVAILABLE");
		assert.equal(json.cloudAgentId, null);
		assert.equal(json.hasChatUrl, true);

		row = {
			...baseRow,
			agent: { ...baseRow.agent, cloudAgentId: "cloud-chat-1", agentStatus: "suspended" },
			persona: {
				...baseRow.persona,
				metadata: { provisioning: { cloudAgentId: "cloud-chat-1", containerId: "container-partial-chat-1" } },
			},
		} as unknown as TokenRuntimeRow;
		res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 409);
		json = (await res.json()) as { error?: string; agentStatus?: string };
		assert.equal(json.error, "CHAT_UNAVAILABLE");
		assert.equal(json.agentStatus, "suspended");
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenChatAccessDepsForTest({});
	}
});

test("GET chat-session gives the token creator admin-scoped hosted chat access", async () => {
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			name: "Admin Chat Waifu",
			ticker: "ADMIN",
			imageUrl: null,
			description: null,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "running",
			ownerClaimStatus: "claimed",
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-admin-chat-1",
			agentStatus: "running",
			lifecycleState: "live",
			webUiUrl: "https://chat.example/admin-agent",
			bridgeUrl: "container-admin-chat-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			lastHeartbeatAt: null,
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-admin-chat-01",
			ownerAddress: null,
			metadata: { provisioning: { cloudAgentId: "cloud-admin-chat-1", containerId: "container-admin-chat-1" } },
		},
	} as unknown as TokenRuntimeRow;
	let balanceRead = false;
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
									if (fields && "token" in fields) return Promise.resolve([row]);
									return Promise.resolve([
										{
											id: "patron-row-1",
											stewardUserId: "steward-user-1",
											primaryEmail: "creator@example.com",
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setRequirePatronDbForTest(db as never);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "creator@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setOwnerTokenChatAccessDepsForTest({
		signingSecret: "chat-secret",
		now: () => new Date("2026-05-27T12:00:00.000Z"),
		readTokenBalance: async () => {
			balanceRead = true;
			return { balance: 0n, decimals: 18 };
		},
	});

	try {
		const res = await app.request("/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200, await res.clone().text());
		const json = (await res.json()) as {
			success: boolean;
			chatUrl: string;
			role: string;
			balanceTokens: number | null;
		};
		assert.equal(json.success, true);
		assert.equal(json.role, "admin");
		assert.equal(json.balanceTokens, null);
		assert.equal(balanceRead, false);

		const url = new URL(json.chatUrl);
		assert.equal(url.pathname, "/admin-agent");
		const token = url.searchParams.get("waifu_access_token");
		assert.ok(token);
		const verified = await jwtVerify(token, new TextEncoder().encode("chat-secret"), {
			issuer: "waifu.fun",
			audience: "eliza-cloud-chat",
			currentDate: new Date("2026-05-27T12:05:00.000Z"),
		});
		assert.equal(verified.payload.role, "admin");
		assert.equal(verified.payload.walletAddress, "0x0000000000000000000000000000000000000001");
		assert.equal(verified.payload.tokenAddress, "0x0000000000000000000000000000000000000004");
		assert.equal(verified.payload.cloudAgentId, "cloud-admin-chat-1");
		assert.equal(verified.payload.balanceTokens, null);
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenChatAccessDepsForTest({});
	}
});

test("GET /owner/tokens chat-session works at the production mount path", async () => {
	const row = {
		token: {
			id: "token-row-1",
			contractAddress: "0x0000000000000000000000000000000000000004",
			chainId: 56,
			name: "Mounted Chat Waifu",
			ticker: "MOUNT",
			imageUrl: null,
			description: null,
			creatorAddress: "0x0000000000000000000000000000000000000001",
			agentStatus: "running",
			ownerClaimStatus: "claimed",
		},
		agent: {
			id: "agent-row-1",
			cloudAgentId: "cloud-mounted-chat-1",
			agentStatus: "running",
			lifecycleState: "live",
			webUiUrl: "https://chat.example/mounted-agent",
			bridgeUrl: "container-mounted-chat-1",
			billingMode: "owner_credits",
			infraReserveUsd: "5",
			lastHeartbeatAt: null,
			suspendedReason: null,
		},
		persona: {
			agentId: "waifu-mounted-chat-01",
			ownerAddress: null,
			metadata: { provisioning: { cloudAgentId: "cloud-mounted-chat-1", containerId: "container-mounted-chat-1" } },
		},
	} as unknown as TokenRuntimeRow;
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
									if (fields && "token" in fields) return Promise.resolve([row]);
									return Promise.resolve([
										{
											id: "patron-row-1",
											stewardUserId: "steward-user-1",
											primaryEmail: "holder@example.com",
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;
	const mounted = new Hono();
	mounted.route("/owner", app);

	__setRequirePatronDbForTest(db as never);
	__setOwnerTokenDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "holder@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000002", chainNamespace: "evm" }],
	}));
	__setOwnerTokenChatAccessDepsForTest({
		signingSecret: "chat-secret",
		now: () => new Date("2026-05-27T12:00:00.000Z"),
		readTokenBalance: async () => ({ balance: 1_001n * 10n ** 18n, decimals: 18 }),
	});

	try {
		const res = await mounted.request("/owner/tokens/bsc/56/0x0000000000000000000000000000000000000004/chat-session", {
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200, await res.clone().text());
		const json = (await res.json()) as { success: boolean; role: string; chatUrl: string };
		assert.equal(json.success, true);
		assert.equal(json.role, "guest");
		const url = new URL(json.chatUrl);
		assert.equal(url.pathname, "/mounted-agent");
		assert.ok(url.searchParams.get("waifu_access_token"));
	} finally {
		__setRequirePatronDbForTest(undefined);
		__setOwnerTokenDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setOwnerTokenChatAccessDepsForTest({});
	}
});
