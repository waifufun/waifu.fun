import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db";
import type { AgentWallet } from "@waifufun/types";

import app, { __setBurnRateRouteDepsForTest } from "./burn-rate.js";

const DUMMY_DB = {} as Database;
const MIXED = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
const LOWER = MIXED.toLowerCase();

function resetDeps() {
	__setBurnRateRouteDepsForTest({
		db: undefined,
		getAgentTokenAddress: undefined,
		listWallets: undefined,
		readNavUsd: undefined,
		computeBurnRate: undefined,
	});
}

test.afterEach(resetDeps);

test("GET /:address/burn-rate lowercases address, computes snapshot, and sets cache", async () => {
	const seen: unknown[] = [];
	const wallets: AgentWallet[] = [
		{
			id: "wallet-1",
			address: "0x440e903000000000000000000000000000000000",
			chain: "bsc",
			role: "agent-safe",
			venue: null,
			label: "safe",
			ownerType: "agent",
			addedAt: 1779435544,
		},
	];
	__setBurnRateRouteDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress(_db, address) {
			seen.push(address);
			return LOWER;
		},
		async listWallets(_db, agentTokenAddress) {
			seen.push(agentTokenAddress);
			return wallets;
		},
		async readNavUsd(_db, agentTokenAddress) {
			seen.push(["nav", agentTokenAddress]);
			return 1200;
		},
		async computeBurnRate(agentTokenAddress, receivedWallets, navUsd) {
			seen.push(["compute", agentTokenAddress, receivedWallets, navUsd]);
			return {
				agentTokenAddress,
				generatedAt: 1779435544,
				burn24hBnb: 1,
				burn24hUsd: 600,
				burn7dBnb: 2,
				burn7dUsd: 1200,
				runwayDays: 2,
				source: "ankr",
				byWallet: [{ walletId: "wallet-1", address: wallets[0]!.address, outflow24hBnb: 1, outflow7dBnb: 2 }],
			};
		},
	});

	const res = await app.request(`/${MIXED}/burn-rate`);

	assert.equal(res.status, 200);
	assert.equal(res.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
	assert.deepEqual(await res.json(), {
		ok: true,
		data: {
			agentTokenAddress: LOWER,
			generatedAt: 1779435544,
			burn24hBnb: 1,
			burn24hUsd: 600,
			burn7dBnb: 2,
			burn7dUsd: 1200,
			runwayDays: 2,
			source: "ankr",
			byWallet: [{ walletId: "wallet-1", address: wallets[0]!.address, outflow24hBnb: 1, outflow7dBnb: 2 }],
		},
	});
	assert.deepEqual(seen, [LOWER, LOWER, ["nav", LOWER], ["compute", LOWER, wallets, 1200]]);
});

test("GET /:address/burn-rate returns 404 when token has no agent", async () => {
	__setBurnRateRouteDepsForTest({
		db: DUMMY_DB,
		async getAgentTokenAddress() {
			return null;
		},
	});

	const res = await app.request(`/${LOWER}/burn-rate`);
	assert.equal(res.status, 404);
	assert.deepEqual(await res.json(), { ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" });
});
