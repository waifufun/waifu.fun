import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db/client";
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

test("topUpOwnedTokenRuntime creates app-credit checkout and marks runtime pending payment", async () => {
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
				return { url: "https://checkout.example/app" };
			},
		},
	);

	assert.deepEqual(result, {
		creditsAmount: 500,
		containerId: "container-1",
		checkout: { url: "https://checkout.example/app" },
		checkoutUrl: "https://checkout.example/app",
	});
	assert.deepEqual(toppedUp, [{ agentId: "cloud-agent-1", amount: 5 }]);
	assert.equal(updates.length, 2);
	assert.equal(updates[0]?.agentStatus, "suspended");
	assert.equal(updates[0]?.lifecycleState, "dormant");
	assert.equal(updates[0]?.infraReserveUsd, "2.5");
	assert.equal(updates[0]?.suspendedReason, "credits_checkout_pending");
	assert.equal(updates[1]?.agentStatus, "suspended");
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

test("POST runtime/restart pauses and resumes the owner token container", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const paused: string[] = [];
	const resumed: string[] = [];
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
		assert.deepEqual(paused, ["container-1"]);
		assert.deepEqual(resumed, ["container-1"]);
		assert.equal(updates[0]?.agentStatus, "running");
		assert.equal(updates[0]?.lifecycleState, "live");
		assert.equal(updates[0]?.suspendedReason, null);
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
