import assert from "node:assert/strict";
import test from "node:test";

import app, { __setAdminAgentsDbForTest } from "./admin-agents.js";

const ADMIN_KEY = "admin_test_key";

function withAdminEnv<T>(fn: () => Promise<T>): Promise<T> {
	const previous = process.env.ADMIN_API_KEY;
	process.env.ADMIN_API_KEY = ADMIN_KEY;
	return fn().finally(() => {
		if (previous === undefined) delete process.env.ADMIN_API_KEY;
		else process.env.ADMIN_API_KEY = previous;
		__setAdminAgentsDbForTest(undefined);
	});
}

function provisioningBody(overrides: Record<string, unknown> = {}) {
	return {
		agentId: "waifu-existing-1",
		tokenContractAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		tokenName: "Existing Agent",
		tokenTicker: "EXIST",
		dryRun: false,
		...overrides,
	};
}

function requestEnqueue(body: Record<string, unknown>) {
	return app.request("/eliza-cloud/test-enqueue-provisioning", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${ADMIN_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

function dbWithProvisioningPreflight(options: { personaExists: boolean; walletAddress?: string | null }) {
	return {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									if (fields && "agentId" in fields) {
										return Promise.resolve(options.personaExists ? [{ agentId: "waifu-existing-1" }] : []);
									}
									if (fields && "walletAddress" in fields) {
										return Promise.resolve(
											options.walletAddress === undefined ? [] : [{ walletAddress: options.walletAddress }],
										);
									}
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
	} as never;
}

test("Eliza Cloud worker enqueue rejects non-dry runs for missing DB personas", async () => {
	await withAdminEnv(async () => {
		__setAdminAgentsDbForTest(dbWithProvisioningPreflight({ personaExists: false }));

		const res = await requestEnqueue(provisioningBody({ agentEvmAddress: undefined }));
		const body = (await res.json()) as { error?: string; message?: string };

		assert.equal(res.status, 404);
		assert.equal(body.error, "AGENT_NOT_FOUND");
		assert.match(body.message ?? "", /must exist before enqueueing real Eliza Cloud worker provisioning/);
	});
});

test("Eliza Cloud worker enqueue rejects non-dry runs before the agent wallet is ready", async () => {
	await withAdminEnv(async () => {
		__setAdminAgentsDbForTest(dbWithProvisioningPreflight({ personaExists: true, walletAddress: null }));

		const res = await requestEnqueue(provisioningBody({ agentEvmAddress: undefined }));
		const body = (await res.json()) as { error?: string; message?: string };

		assert.equal(res.status, 409);
		assert.equal(body.error, "AGENT_WALLET_NOT_READY");
		assert.match(body.message ?? "", /valid EVM wallet/);
	});
});
