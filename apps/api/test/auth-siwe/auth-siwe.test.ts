import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../src/middleware/patron-auth.ts";
import {
	__clearAuthSiweNoncesForTest,
	__setAuthSiweDbForTest,
	__setAuthSiweVerifierForTest,
	authSiweRoutes,
} from "../../src/routes/v2/auth-siwe.ts";

const PATRON_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_PATRON_ID = "00000000-0000-4000-8000-000000000002";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

type WalletRow = { patronId: string; address: string; chainId: number; isPrimary: boolean };

function readDrizzleTableName(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

function fakeDb(opts: { wallets?: WalletRow[]; deleteCount?: number } = {}) {
	const state = {
		wallets: [...(opts.wallets ?? [])],
		inserts: [] as Record<string, unknown>[],
		updates: [] as Record<string, unknown>[],
		deleteCount: opts.deleteCount ?? 1,
	};

	const db = {
		state,
		select() {
			let table: string | null = null;
			const builder = {
				from(t: unknown) {
					table = readDrizzleTableName(t);
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "patron_users") {
						return Promise.resolve([{ id: PATRON_ID, stewardUserId: "steward-1", primaryEmail: "a@b.test" }]);
					}
					if (table === "patron_wallets") return Promise.resolve(state.wallets);
					return Promise.resolve([]);
				},
			};
			return builder;
		},
		insert() {
			return {
				values(v: Record<string, unknown>) {
					state.inserts.push(v);
					state.wallets.push(v as WalletRow);
					return { returning: () => Promise.resolve([v]) };
				},
			};
		},
		update() {
			return {
				set(v: Record<string, unknown>) {
					state.updates.push(v);
					return { where: () => Promise.resolve([]) };
				},
			};
		},
		delete() {
			return {
				where() {
					return {
						returning() {
							return Promise.resolve(state.deleteCount > 0 ? state.wallets.splice(0, state.deleteCount) : []);
						},
					};
				},
			};
		},
	} as never as { state: typeof state };

	return db;
}

function app() {
	const h = new Hono();
	h.route("/auth/siwe", authSiweRoutes as never);
	return h;
}

function authHeaders() {
	return { authorization: "Bearer steward-token", "content-type": "application/json" };
}

function siweMessage(address: string, nonce: string, chainId = 56): string {
	return `waifu.fun wants you to sign in with your Ethereum account:
${address}

Link this wallet to your waifu.fun patron account.

URI: https://waifu.fun/patron/wallets
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: 2026-05-16T00:00:00.000Z
Expiration Time: 2030-01-01T00:00:00.000Z`;
}

describe("/v2/auth/siwe", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setAuthSiweDbForTest(undefined);
		__setAuthSiweVerifierForTest(undefined);
		__clearAuthSiweNoncesForTest();
	});

	function installAuthAndDb(db = fakeDb()) {
		__setRequirePatronStewardParserForTest((async () => ({
			userId: "steward-1",
			tenantId: "waifu",
			email: "a@b.test",
		})) as StewardParser);
		__setRequirePatronDbForTest(db as never);
		__setAuthSiweDbForTest(db as never);
		return db;
	}

	it("requires Steward auth for nonce", async () => {
		installAuthAndDb();
		const res = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: { "content-type": "application/json" },
		});
		assert.equal(res.status, 401);
	});

	it("returns a patron-scoped nonce", async () => {
		installAuthAndDb();
		const res = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { ok: boolean; nonce: string; expiresInSeconds: number };
		assert.equal(body.ok, true);
		assert.equal(body.expiresInSeconds, 600);
		assert.match(body.nonce, /^[A-Za-z0-9]{8,}$/);
	});

	it("binds a wallet after SIWE verification and nonce consumption", async () => {
		const db = installAuthAndDb();
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 56, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({ message: siweMessage(ADDRESS, nonce), signature: "0xsig", setPrimary: true }),
			headers: authHeaders(),
		});

		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { ok: true, address: ADDRESS, chainId: 56 });
		assert.equal(db.state.inserts.length, 1);
		assert.equal(db.state.inserts[0]?.patronId, PATRON_ID);
	});

	it("rejects wrong or expired nonce", async () => {
		installAuthAndDb();
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 56, nonce: "wrong" }));
		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({ message: siweMessage(ADDRESS, "wrong"), signature: "0xsig" }),
			headers: authHeaders(),
		});
		assert.equal(res.status, 400);
	});

	it("rejects replaying a nonce issued for a different wallet", async () => {
		installAuthAndDb();
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: OTHER, chainId: 56, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({ message: siweMessage(OTHER, nonce), signature: "0xsig" }),
			headers: authHeaders(),
		});
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { error: string }).error, "nonce mismatch or expired");
	});

	it("rejects a SIWE message for another domain", async () => {
		installAuthAndDb();
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 56, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({
				message: siweMessage(ADDRESS, nonce).replace("waifu.fun wants", "evil.example wants"),
				signature: "0xsig",
			}),
			headers: authHeaders(),
		});
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { error: string }).error, "SIWE domain is not allowed");
	});

	it("rejects a SIWE message with the wrong chain", async () => {
		installAuthAndDb();
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 1, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({ message: siweMessage(ADDRESS, nonce, 1), signature: "0xsig" }),
			headers: authHeaders(),
		});
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { error: string }).error, "SIWE chainId must be 56");
	});

	it("rejects a SIWE message with the wrong statement", async () => {
		installAuthAndDb();
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 56, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({
				message: siweMessage(ADDRESS, nonce).replace(
					"Link this wallet to your waifu.fun patron account.",
					"Sign in to waifu.fun.",
				),
				signature: "0xsig",
			}),
			headers: authHeaders(),
		});
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { error: string }).error, "SIWE statement is not allowed");
	});

	it("rejects a SIWE message with the wrong URI path", async () => {
		installAuthAndDb();
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 56, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({
				message: siweMessage(ADDRESS, nonce).replace("/patron/wallets", "/create/wizard"),
				signature: "0xsig",
			}),
			headers: authHeaders(),
		});
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { error: string }).error, "SIWE uri path is not allowed");
	});

	it("rejects a wallet already bound to another patron", async () => {
		const db = installAuthAndDb(
			fakeDb({
				wallets: [{ patronId: OTHER_PATRON_ID, address: ADDRESS, chainId: 56, isPrimary: false }],
			}),
		);
		const nonceRes = await app().request("http://unit.test/auth/siwe/nonce", {
			method: "POST",
			body: JSON.stringify({ address: ADDRESS }),
			headers: authHeaders(),
		});
		const { nonce } = (await nonceRes.json()) as { nonce: string };
		__setAuthSiweVerifierForTest(async () => ({ address: ADDRESS, chainId: 56, nonce }));

		const res = await app().request("http://unit.test/auth/siwe/bind", {
			method: "POST",
			body: JSON.stringify({ message: siweMessage(ADDRESS, nonce), signature: "0xsig" }),
			headers: authHeaders(),
		});
		assert.equal(res.status, 409);
		assert.equal(db.state.inserts.length, 0);
	});

	it("lists, deletes, and sets primary wallets", async () => {
		const db = installAuthAndDb(
			fakeDb({
				wallets: [{ patronId: PATRON_ID, address: ADDRESS, chainId: 56, isPrimary: false }],
			}),
		);

		const list = await app().request("http://unit.test/auth/siwe/wallets", {
			headers: authHeaders(),
		});
		assert.equal(list.status, 200);
		assert.equal(((await list.json()) as { wallets: unknown[] }).wallets.length, 1);

		const primary = await app().request(`http://unit.test/auth/siwe/wallets/${ADDRESS}/primary`, {
			method: "POST",
			headers: authHeaders(),
		});
		assert.equal(primary.status, 200);
		assert.deepEqual(db.state.updates, [{ isPrimary: false }, { isPrimary: true }]);

		const del = await app().request(`http://unit.test/auth/siwe/wallets/${ADDRESS}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		assert.equal(del.status, 200);
	});

	it("404s when deleting a missing wallet", async () => {
		installAuthAndDb(fakeDb({ deleteCount: 0 }));
		const res = await app().request(`http://unit.test/auth/siwe/wallets/${OTHER}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		assert.equal(res.status, 404);
	});
});
