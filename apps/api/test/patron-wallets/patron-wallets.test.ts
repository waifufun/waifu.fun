import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	__setRequirePatronDbForTest,
	__setRequirePatronRecordPrimaryWalletsForTest,
	__setRequirePatronStewardParserForTest,
} from "../../src/middleware/patron-auth.js";
import {
	__clearPatronWalletsNoncesForTest,
	__setPatronWalletsDbForTest,
	__setPatronWalletsSiweVerifierForTest,
	createV3PatronRoutes,
} from "../../src/routes/v3/patron.js";

type WalletKind = "steward_primary" | "linked_eoa";

type WalletRow = {
	id: string;
	patronId: string;
	address: string;
	chainId: number;
	kind: WalletKind;
	addedAt: Date;
	linkedAt: Date;
	lastUsedAt: Date | null;
	label: string | null;
	isPrimary: boolean;
};

type PatronRow = { id: string; stewardUserId: string | null; primaryEmail: string | null };

type State = {
	patron: PatronRow;
	wallets: WalletRow[];
	primaryAddress: `0x${string}`;
};

const PATRON_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_PATRON_ID = "00000000-0000-4000-8000-0000000000b2";
const PRIMARY = "0x1111111111111111111111111111111111111111";
const LINKED = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const NOW = new Date("2026-05-02T09:00:00.000Z");

function tableName(table: unknown): string | null {
	if (!table || typeof table !== "object") return null;
	for (const symbol of Object.getOwnPropertySymbols(table)) {
		if (symbol.description === "drizzle:Name") return String((table as Record<symbol, unknown>)[symbol]);
	}
	return null;
}

function predicateValues(predicate: unknown): string[] {
	const values: string[] = [];
	function visit(value: unknown) {
		if (!value || typeof value !== "object") return;
		const maybe = value as { value?: unknown; queryChunks?: unknown[] };
		if (typeof maybe.value === "string") values.push(maybe.value);
		for (const chunk of maybe.queryChunks ?? []) visit(chunk);
	}
	visit(predicate);
	return values;
}

function makeWallet(values: Partial<WalletRow> & Pick<WalletRow, "address" | "kind" | "patronId">): WalletRow {
	return {
		id: values.id ?? `wallet-${values.address}`,
		patronId: values.patronId,
		address: values.address.toLowerCase(),
		chainId: values.chainId ?? 56,
		kind: values.kind,
		addedAt: values.addedAt ?? NOW,
		linkedAt: values.linkedAt ?? NOW,
		lastUsedAt: values.lastUsedAt ?? null,
		label: values.label ?? null,
		isPrimary: values.isPrimary ?? values.kind === "steward_primary",
	};
}

function makeDb(state: State) {
	return {
		select() {
			let selectedTable: string | null = null;
			let values: string[] = [];
			const builder = {
				from(table: unknown) {
					selectedTable = tableName(table);
					return builder;
				},
				where(predicate: unknown) {
					values = predicateValues(predicate);
					return builder;
				},
				limit() {
					return Promise.resolve(resolveRows());
				},
			};
			function resolveRows() {
				if (selectedTable === "patron_users") return [state.patron];
				if (selectedTable !== "patron_wallets") return [];
				return state.wallets.filter((wallet) => {
					const addressFilters = values.filter((value) => value.startsWith("0x"));
					const patronFilters = values.filter((value) => value.includes("0000-4000"));
					return (
						(addressFilters.length === 0 || addressFilters.includes(wallet.address)) &&
						(patronFilters.length === 0 || patronFilters.includes(wallet.patronId))
					);
				});
			}
			return builder;
		},
		insert(table: unknown) {
			return {
				values(values: Partial<WalletRow>) {
					return {
						returning() {
							if (tableName(table) === "patron_wallets") {
								const wallet = makeWallet(values as WalletRow);
								state.wallets.push(wallet);
								return Promise.resolve([wallet]);
							}
							return Promise.resolve([state.patron]);
						},
					};
				},
			};
		},
		update(table: unknown) {
			return {
				set(values: Partial<WalletRow>) {
					return {
						where(predicate: unknown) {
							const filters = predicateValues(predicate);
							if (tableName(table) === "patron_wallets") {
								for (const wallet of state.wallets) {
									if (filters.includes(wallet.address) || filters.includes(wallet.patronId))
										Object.assign(wallet, values);
								}
							}
							return Promise.resolve([]);
						},
					};
				},
			};
		},
		delete(table: unknown) {
			return {
				where(predicate: unknown) {
					return {
						returning() {
							if (tableName(table) !== "patron_wallets") return Promise.resolve([]);
							const filters = predicateValues(predicate);
							const deleted: WalletRow[] = [];
							state.wallets = state.wallets.filter((wallet) => {
								const match =
									filters.includes(wallet.patronId) &&
									filters.includes(wallet.address) &&
									filters.includes(wallet.kind);
								if (match) deleted.push(wallet);
								return !match;
							});
							return Promise.resolve(deleted);
						},
					};
				},
			};
		},
	} as never;
}

function makeApp(state: State) {
	const db = makeDb(state);
	__setRequirePatronDbForTest(db);
	__setPatronWalletsDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: state.patron.stewardUserId ?? "steward-1",
		tenantId: "waifu",
		address: state.primaryAddress,
	}));
	__setRequirePatronRecordPrimaryWalletsForTest(true);
	const app = new Hono();
	app.route("/patron", createV3PatronRoutes() as never);
	return app;
}

function goodSiwe(address = LINKED, nonce = "nonce-1") {
	return {
		address: address as `0x${string}`,
		chainId: 56,
		nonce,
		domain: "waifu.fun",
		uri: "https://waifu.fun/patron/wallets",
		statement: "Link this wallet to your waifu.fun patron account.",
		expirationTime: "2999-01-01T00:00:00.000Z",
	};
}

async function issueLinkNonce(app: Hono, address = LINKED): Promise<string> {
	const res = await app.request("/patron/wallets/link/nonce", {
		method: "POST",
		headers: { authorization: "Bearer steward", "content-type": "application/json" },
		body: JSON.stringify({ address }),
	});
	assert.equal(res.status, 200);
	return ((await res.json()) as { nonce: string }).nonce;
}

function stateWith(wallets: WalletRow[] = []): State {
	return {
		patron: { id: PATRON_ID, stewardUserId: "steward-1", primaryEmail: null },
		primaryAddress: PRIMARY,
		wallets,
	};
}

describe("/v3/patron wallets", () => {
	beforeEach(() => {
		__setPatronWalletsSiweVerifierForTest(async () => goodSiwe());
	});

	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setPatronWalletsDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setRequirePatronRecordPrimaryWalletsForTest(false);
		__setPatronWalletsSiweVerifierForTest(undefined);
		__clearPatronWalletsNoncesForTest();
	});

	it("auto-records the primary wallet on the first authed call", async () => {
		const state = stateWith();
		const res = await makeApp(state).request("/patron/me", { headers: { authorization: "Bearer steward" } });
		assert.equal(res.status, 200);
		assert.equal(state.wallets[0]?.address, PRIMARY);
		assert.equal(state.wallets[0]?.kind, "steward_primary");
	});

	it("rejects bad SIWE signatures", async () => {
		__setPatronWalletsSiweVerifierForTest(async () => {
			throw new Error("bad signature");
		});
		const res = await makeApp(stateWith()).request("/patron/wallets/link", {
			method: "POST",
			headers: { authorization: "Bearer steward", "content-type": "application/json" },
			body: JSON.stringify({ address: LINKED, signature: "0x1234", message: "bad" }),
		});
		assert.equal(res.status, 400);
	});

	it("rejects the primary address as a linked wallet", async () => {
		__setPatronWalletsSiweVerifierForTest(async () => goodSiwe(PRIMARY));
		const res = await makeApp(stateWith()).request("/patron/wallets/link", {
			method: "POST",
			headers: { authorization: "Bearer steward", "content-type": "application/json" },
			body: JSON.stringify({ address: PRIMARY, signature: "0x1234", message: "primary" }),
		});
		assert.equal(res.status, 409);
	});

	it("rejects cross-patron wallet collisions", async () => {
		const state = stateWith([makeWallet({ patronId: OTHER_PATRON_ID, address: LINKED, kind: "linked_eoa" })]);
		const app = makeApp(state);
		const nonce = await issueLinkNonce(app);
		__setPatronWalletsSiweVerifierForTest(async () => goodSiwe(LINKED, nonce));
		const res = await app.request("/patron/wallets/link", {
			method: "POST",
			headers: { authorization: "Bearer steward", "content-type": "application/json" },
			body: JSON.stringify({ address: LINKED, signature: "0x1234", message: "ok" }),
		});
		assert.equal(res.status, 409);
	});

	it("unlinks a linked EOA", async () => {
		const state = stateWith([makeWallet({ patronId: PATRON_ID, address: LINKED, kind: "linked_eoa" })]);
		const res = await makeApp(state).request(`/patron/wallets/link/${LINKED}`, {
			method: "DELETE",
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 200);
		assert.equal(
			state.wallets.some((wallet) => wallet.address === LINKED),
			false,
		);
	});

	it("404s when unlinking the primary wallet", async () => {
		const state = stateWith([makeWallet({ patronId: PATRON_ID, address: PRIMARY, kind: "steward_primary" })]);
		const res = await makeApp(state).request(`/patron/wallets/link/${PRIMARY}`, {
			method: "DELETE",
			headers: { authorization: "Bearer steward" },
		});
		assert.equal(res.status, 404);
	});

	it("returns linked wallet summaries from GET me", async () => {
		const state = stateWith([
			makeWallet({ patronId: PATRON_ID, address: PRIMARY, kind: "steward_primary" }),
			makeWallet({ patronId: PATRON_ID, address: OTHER, kind: "linked_eoa", label: "cold" }),
		]);
		const res = await makeApp(state).request("/patron/me", { headers: { authorization: "Bearer steward" } });
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			primaryAddress: string;
			linkedWallets: Array<{ address: string; label: string | null }>;
		};
		assert.equal(body.primaryAddress, PRIMARY);
		assert.deepEqual(body.linkedWallets, [
			{ address: OTHER, label: "cold", addedAt: NOW.toISOString(), lastUsedAt: null },
		]);
	});
});
