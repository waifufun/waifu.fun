import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db";

import app, { __setAgentWalletRoutesDepsForTest } from "./agent-wallets.js";

const DUMMY_DB = {} as Database;
const MIXED = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
const LOWER = MIXED.toLowerCase();

function resetDeps() {
	__setAgentWalletRoutesDepsForTest({
		db: undefined,
		getAgentTokenAddress: undefined,
		listWallets: undefined,
		listActivityTrades: undefined,
	});
}

test.afterEach(resetDeps);

test("GET /:address/wallets lowercases address and returns wallet registry shape", async () => {
	const seen: string[] = [];
	__setAgentWalletRoutesDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress(_db, address) {
			seen.push(address);
			return LOWER;
		},
		async listWallets(_db, agentTokenAddress) {
			seen.push(agentTokenAddress);
			return [
				{
					id: "wallet-1",
					address: "0x440e903000000000000000000000000000000000",
					chain: "bsc",
					role: "agent-safe",
					venue: null,
					label: "agent-safe (waifu)",
					ownerType: "agent",
					addedAt: 1779435544,
				},
			];
		},
	});

	const res = await app.request(`/${MIXED}/wallets`);
	assert.equal(res.status, 200);
	assert.equal(res.headers.get("cache-control"), "public, max-age=30, stale-while-revalidate=60");
	assert.deepEqual(seen, [LOWER, LOWER]);
	assert.deepEqual(await res.json(), {
		ok: true,
		data: {
			agentTokenAddress: LOWER,
			wallets: [
				{
					id: "wallet-1",
					address: "0x440e903000000000000000000000000000000000",
					chain: "bsc",
					role: "agent-safe",
					venue: null,
					label: "agent-safe (waifu)",
					ownerType: "agent",
					addedAt: 1779435544,
				},
			],
		},
	});
});

test("GET /:address/wallets returns 404 when token has no agent", async () => {
	__setAgentWalletRoutesDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress() {
			return null;
		},
		async listWallets() {
			throw new Error("must not list wallets for a missing agent");
		},
	});

	const res = await app.request(`/${LOWER}/wallets`);
	assert.equal(res.status, 404);
	assert.deepEqual(await res.json(), { ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" });
});

test("GET /:address/wallets returns empty wallets for existing agent with none registered", async () => {
	__setAgentWalletRoutesDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress() {
			return LOWER;
		},
		async listWallets() {
			return [];
		},
	});

	const res = await app.request(`/${LOWER}/wallets`);
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { ok: true, data: { agentTokenAddress: LOWER, wallets: [] } });
});

test("GET /:address/activity-trades returns only Sol-owned wallet initiated trades", async () => {
	const seen: Array<string | number> = [];
	__setAgentWalletRoutesDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress(_db, address) {
			seen.push(address);
			return LOWER;
		},
		async listActivityTrades(_db, agentTokenAddress, limit) {
			seen.push(agentTokenAddress, limit ?? 0);
			return [
				{
					txHash: "0xtrade1",
					trader: "0x440e903000000000000000000000000000000000",
					traderRole: "agent-safe",
					tokenAddress: "0xwaifu00000000000000000000000000000000000",
					tokenSymbol: "WAIFU",
					side: "buy",
					amountIn: "1.23",
					amountOut: "420",
					usdValue: 100.5,
					blockTimestamp: "2026-05-22T13:00:00.000Z",
				},
			];
		},
	});

	const res = await app.request(`/${MIXED}/activity-trades`);
	assert.equal(res.status, 200);
	assert.equal(res.headers.get("cache-control"), "public, max-age=15, stale-while-revalidate=60");
	assert.deepEqual(seen, [LOWER, LOWER, 20]);
	assert.deepEqual(await res.json(), [
		{
			txHash: "0xtrade1",
			trader: "0x440e903000000000000000000000000000000000",
			traderRole: "agent-safe",
			tokenAddress: "0xwaifu00000000000000000000000000000000000",
			tokenSymbol: "WAIFU",
			side: "buy",
			amountIn: "1.23",
			amountOut: "420",
			usdValue: 100.5,
			blockTimestamp: "2026-05-22T13:00:00.000Z",
		},
	]);
});

test("GET /:address/activity-trades returns an honest empty array for no Sol trades", async () => {
	__setAgentWalletRoutesDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress() {
			return LOWER;
		},
		async listActivityTrades() {
			return [];
		},
	});

	const res = await app.request(`/${LOWER}/activity-trades`);
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), []);
});

test("GET /:address/activity-trades returns 404 when token has no agent", async () => {
	__setAgentWalletRoutesDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress() {
			return null;
		},
		async listActivityTrades() {
			throw new Error("must not list activity trades for a missing agent");
		},
	});

	const res = await app.request(`/${LOWER}/activity-trades`);
	assert.equal(res.status, 404);
	assert.deepEqual(await res.json(), { ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" });
});
