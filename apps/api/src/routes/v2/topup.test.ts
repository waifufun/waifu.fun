import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { Database } from "@waifufun/db";

import app, { __setTopupRoutesDepsForTest, selectTopupStatusCandidate } from "./topup.js";

const TOKEN = "0x0000000000000000000000000000000000000001";
const OTHER_TOKEN = "0x0000000000000000000000000000000000000002";
const PATRON = "0x0000000000000000000000000000000000000003";
const TX_HASH = `0x${"1".repeat(64)}`;

describe("selectTopupStatusCandidate", () => {
	it("selects the latest unresolved quote for the same agent, source chain, and bridge", () => {
		const older = {
			id: "older",
			agentTokenAddress: TOKEN,
			patronAddress: PATRON,
			fromChain: 56,
			bridge: "relaydepository",
			status: "quoted",
			txHash: null,
			createdAt: new Date("2026-06-01T00:00:00.000Z"),
		};
		const latest = {
			...older,
			id: "latest",
			createdAt: new Date("2026-06-01T00:05:00.000Z"),
		};
		const row = selectTopupStatusCandidate(
			[
				{ ...latest, agentTokenAddress: OTHER_TOKEN },
				{ ...latest, id: "already-bound", txHash: TX_HASH },
				{ ...latest, id: "terminal", status: "completed" },
				{ ...latest, id: "wrong-patron", patronAddress: OTHER_TOKEN },
				{ ...latest, id: "wrong-chain", fromChain: 1 },
				{ ...latest, id: "wrong-bridge", bridge: "across" },
				older,
				latest,
			],
			{ agentTokenAddress: TOKEN, fromChain: 56, bridge: "relaydepository", fromAddress: PATRON },
		);

		assert.equal(row?.id, "latest");
	});

	it("does not bind an unresolved quote from another source chain", () => {
		const row = selectTopupStatusCandidate(
			[
				{
					id: "wrong-chain",
					agentTokenAddress: TOKEN,
					patronAddress: PATRON,
					fromChain: 1,
					bridge: "relaydepository",
					status: "quoted",
					txHash: null,
					createdAt: new Date("2026-06-01T00:00:00.000Z"),
				},
			],
			{ agentTokenAddress: TOKEN, fromChain: 56, bridge: "relaydepository", fromAddress: PATRON },
		);

		assert.equal(row, null);
	});
});

describe("POST /:address/topup/status", () => {
	afterEach(() => __setTopupRoutesDepsForTest({ db: undefined, lifi: undefined }));

	it("binds a status poll to the unresolved quote row when txHash was not recorded at quote time", async () => {
		const updated: Array<Record<string, unknown>> = [];
		let updateCall = 0;
		const db = {
			update() {
				updateCall += 1;
				return {
					set(values: Record<string, unknown>) {
						return {
							where() {
								if (updateCall === 1) {
									return {
										returning() {
											return Promise.resolve([]);
										},
									};
								}
								updated.push(values);
								return Promise.resolve();
							},
						};
					},
				};
			},
			select() {
				return {
					from() {
						return {
							where() {
								return {
									orderBy() {
										return {
											limit() {
												return Promise.resolve([
													{
														id: "quote-row",
														agentTokenAddress: TOKEN,
														patronAddress: PATRON,
														fromChain: 56,
														bridge: "relaydepository",
														status: "quoted",
														txHash: null,
														createdAt: new Date("2026-06-01T00:00:00.000Z"),
													},
												]);
											},
										};
									},
								};
							},
						};
					},
				};
			},
		} as unknown as Database;
		const lifi = {
			getStatus: async () => ({
				status: "PENDING" as const,
				tool: "relaydepository",
				receiving: { amount: "99000000" },
			}),
		};

		__setTopupRoutesDepsForTest({ db, lifi: lifi as never });
		const res = await app.request(`/${TOKEN}/topup/status`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ txHash: TX_HASH, fromChain: 56, fromAddress: PATRON, bridge: "relaydepository" }),
		});

		assert.equal(res.status, 200);
		assert.equal(updateCall, 2);
		assert.equal(updated.length, 1);
		assert.equal(updated[0]?.status, "pending");
		assert.equal(updated[0]?.txHash, TX_HASH);
		assert.equal(updated[0]?.bridge, "relaydepository");
		assert.equal(updated[0]?.toAmount, "99000000");
	});

	it("does not bind an unresolved quote without a source chain", async () => {
		let selectCalls = 0;
		const db = {
			update() {
				return {
					set() {
						return {
							where() {
								return {
									returning() {
										return Promise.resolve([]);
									},
								};
							},
						};
					},
				};
			},
			select() {
				selectCalls += 1;
				return {
					from() {
						return {
							where() {
								return {
									orderBy() {
										return { limit: async () => [] };
									},
								};
							},
						};
					},
				};
			},
		} as unknown as Database;
		const lifi = { getStatus: async () => ({ status: "PENDING" as const, tool: "relaydepository" }) };

		__setTopupRoutesDepsForTest({ db, lifi: lifi as never });
		const res = await app.request(`/${TOKEN}/topup/status`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ txHash: TX_HASH, bridge: "relaydepository" }),
		});

		assert.equal(res.status, 200);
		assert.equal(selectCalls, 0);
	});
});
