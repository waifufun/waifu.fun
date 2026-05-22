import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
	__setRequireWalletSiweVerifierForTest,
} from "../../middleware/patron-auth.js";
import launchAuthorizeRoutes, { __setLaunchAuthorizeDepsForTest, authorizeLaunch } from "./launches-authorize.js";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const SAFE = "0x3333333333333333333333333333333333333333" as const;

function baseRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "launch-1",
		status: "provisioned",
		chainId: 56,
		portalAddress: "0x4444444444444444444444444444444444444444",
		quoteToken: null,
		tokenName: "Eliza Agent",
		tokenTicker: "MLDY",
		tokenDescription: "agent launch",
		tokenImageUrl: "ipfs://image",
		socials: {},
		taxRate: 500,
		agentPersonaId: "persona-uuid",
		agentId: "waifu-test",
		ownerAddress: OWNER,
		safeAddress: SAFE,
		launchId: "launch-1",
		personaUuid: "persona-uuid",
		personaAgentId: "waifu-test",
		...overrides,
	};
}

function fakeDb(row: Record<string, unknown> | null, updateSucceeds = true) {
	const updates: unknown[] = [];
	return {
		updates,
		select() {
			return {
				from() {
					return this;
				},
				leftJoin() {
					return this;
				},
				where() {
					return this;
				},
				limit() {
					return row ? [row] : [];
				},
			};
		},
		update() {
			return {
				set(value: unknown) {
					updates.push(value);
					return this;
				},
				where() {
					return this;
				},
				returning() {
					return updateSucceeds ? [{ id: "launch-1", status: "queued" }] : [];
				},
			};
		},
	};
}

function readDrizzleTableName(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

function routeDb(opts: { walletBound?: boolean; ownerAddress?: string | null } = {}) {
	const thisDb = {
		updates: [] as unknown[],
		select() {
			let table: string | null = null;
			const builder = {
				from(t: unknown) {
					table = readDrizzleTableName(t);
					return builder;
				},
				leftJoin() {
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "patron_users") {
						return Promise.resolve([{ id: "patron-1", stewardUserId: "steward-1", primaryEmail: null }]);
					}
					if (table === "patron_wallets") {
						return Promise.resolve(
							opts.walletBound === false
								? []
								: [{ patronId: "patron-1", address: OWNER.toLowerCase(), isPrimary: true }],
						);
					}
					if (table === "agent_personas") return Promise.resolve([]);
					if (table === "launches") {
						return Promise.resolve([
							baseRow({
								ownerAddress: opts.ownerAddress === undefined ? OWNER : opts.ownerAddress,
							}),
						]);
					}
					return Promise.resolve([]);
				},
			};
			return builder;
		},
		update() {
			return {
				set(value: unknown) {
					thisDb.updates.push(value);
					return this;
				},
				where() {
					return this;
				},
				returning() {
					return [{ id: "launch-1", status: "queued" }];
				},
			};
		},
	};
	return thisDb as never;
}

function noopDeps(db: unknown, balance = 10n) {
	const enqueued: unknown[] = [];
	const emitted: unknown[] = [];
	return {
		deps: {
			db: db as never,
			getSafeBalanceWei: async () => balance,
			enqueueLaunchPrep: async (...args: unknown[]) => {
				enqueued.push(args);
				return {} as never;
			},
			emitEvent: async (event: unknown) => {
				emitted.push(event);
				return {} as never;
			},
			now: () => new Date("2026-04-24T00:00:00.000Z"),
		},
		enqueued,
		emitted,
	};
}

describe("POST /v2/launches/:id/authorize", () => {
	afterEach(() => {
		__setLaunchAuthorizeDepsForTest(undefined);
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setRequireWalletSiweVerifierForTest(undefined);
	});

	it("requires patron auth on the route", async () => {
		const app = new Hono();
		app.route("/launches", launchAuthorizeRoutes);

		const res = await app.request("http://unit.test/launches/launch-1/authorize", {
			method: "POST",
			body: JSON.stringify({ firstBuyWei: "0" }),
			headers: { "content-type": "application/json" },
		});

		assert.equal(res.status, 401);
	});

	it("rejects Steward auth when the selected wallet is not bound", async () => {
		const db = routeDb({ walletBound: false });
		__setRequirePatronStewardParserForTest((async () => ({
			userId: "steward-1",
			tenantId: "waifu",
		})) as StewardParser);
		__setRequirePatronDbForTest(db as never);
		__setLaunchAuthorizeDepsForTest(noopDeps(db).deps);

		const app = new Hono();
		app.route("/launches", launchAuthorizeRoutes);
		const res = await app.request("http://unit.test/launches/launch-1/authorize", {
			method: "POST",
			body: JSON.stringify({ address: OWNER, firstBuyWei: "0" }),
			headers: { authorization: "Bearer steward-token", "content-type": "application/json" },
		});

		assert.equal(res.status, 403);
	});

	it("rejects a bound wallet that does not own the launch agent", async () => {
		const db = routeDb({ ownerAddress: OTHER });
		__setRequirePatronStewardParserForTest((async () => ({
			userId: "steward-1",
			tenantId: "waifu",
		})) as StewardParser);
		__setRequirePatronDbForTest(db as never);
		__setLaunchAuthorizeDepsForTest(noopDeps(db).deps);

		const app = new Hono();
		app.route("/launches", launchAuthorizeRoutes);
		const res = await app.request("http://unit.test/launches/launch-1/authorize", {
			method: "POST",
			body: JSON.stringify({ address: OWNER, firstBuyWei: "0" }),
			headers: { authorization: "Bearer steward-token", "content-type": "application/json" },
		});

		assert.equal(res.status, 403);
	});

	it("authorizes with Steward auth plus a bound owner wallet and fresh SIWE", async () => {
		const db = routeDb();
		__setRequirePatronStewardParserForTest((async () => ({
			userId: "steward-1",
			tenantId: "waifu",
		})) as StewardParser);
		__setRequireWalletSiweVerifierForTest(async () => ({
			address: OWNER,
			chainId: 56,
			nonce: "nonce",
		}));
		__setRequirePatronDbForTest(db as never);
		const { deps } = noopDeps(db, 10n);
		__setLaunchAuthorizeDepsForTest(deps);

		const app = new Hono();
		app.route("/launches", launchAuthorizeRoutes);
		const res = await app.request("http://unit.test/launches/launch-1/authorize", {
			method: "POST",
			body: JSON.stringify({ siwe: { message: "siwe", signature: "0xsig" }, firstBuyWei: "0" }),
			headers: { authorization: "Bearer steward-token", "content-type": "application/json" },
		});

		assert.equal(res.status, 200);
	});

	it("checks the patron wallet against agent_personas.owner_address", async () => {
		const db = fakeDb(baseRow());
		const { deps } = noopDeps(db);
		const res = await authorizeLaunch({ launchId: "launch-1", patronWallet: OTHER, deps });
		assert.equal(res.status, 403);
	});

	it("guards provisioned status", async () => {
		const db = fakeDb(baseRow({ status: "queued" }));
		const { deps } = noopDeps(db);
		const res = await authorizeLaunch({ launchId: "launch-1", patronWallet: OWNER, deps });
		assert.equal(res.status, 409);
		assert.equal(res.ok, false);
	});

	it("rejects first buys larger than the Safe balance", async () => {
		const db = fakeDb(baseRow());
		const { deps } = noopDeps(db, 9n);
		const res = await authorizeLaunch({
			launchId: "launch-1",
			patronWallet: OWNER,
			firstBuyWei: "10",
			deps,
		});
		assert.equal(res.status, 400);
	});

	it("queues launch-prep, emits launch.authorized, and returns queued", async () => {
		const db = fakeDb(baseRow());
		const { deps, enqueued, emitted } = noopDeps(db, 10n);
		const res = await authorizeLaunch({
			launchId: "launch-1",
			patronWallet: OWNER,
			firstBuyWei: "10",
			deps,
		});

		assert.equal(res.status, 200);
		assert.deepEqual(res.body, {
			launchId: "launch-1",
			status: "queued",
			firstBuyWei: "10",
			txHashPending: true,
		});
		assert.equal(enqueued.length, 1);
		assert.equal((enqueued[0] as [{ launchId: string }])[0].launchId, "launch-1");
		assert.equal(emitted.length, 1);
		assert.equal((emitted[0] as { eventType: string }).eventType, "launch.authorized");
	});
});
