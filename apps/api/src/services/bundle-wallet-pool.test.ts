import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db/client";

import {
	BUNDLE_WALLET_COOLDOWN_SECONDS,
	addressForPrivateKey,
	decryptBundleWalletPk,
	encryptBundleWalletPk,
	markUsed,
	selectAvailableWallet,
} from "./bundle-wallet-pool.js";

const addressA = "0x00000000000000000000000000000000000000aa";
const encryptedPkA = `0x${"11".repeat(32)}`;

function makeSelectDb(rows: Array<{ address: string; encrypted_pk: string }>): Database {
	return {
		transaction: async (
			fn: (tx: {
				execute: () => Promise<typeof rows>;
				update: () => { set: () => { where: () => Promise<void> } };
			}) => Promise<unknown>,
		) =>
			fn({
				execute: async () => rows,
				update: () => ({ set: () => ({ where: async () => undefined }) }),
			}),
	} as unknown as Database;
}

function makeUpdateDb(capture: { set?: Record<string, unknown>; whereCalled?: boolean }): Database {
	return {
		update: () => ({
			set(values: Record<string, unknown>) {
				capture.set = values;
				return {
					where() {
						capture.whereCalled = true;
						return Promise.resolve();
					},
				};
			},
		}),
	} as unknown as Database;
}

test("selectAvailableWallet returns the first locked available wallet", async () => {
	const db = makeSelectDb([{ address: addressA, encrypted_pk: encryptedPkA }]);
	const wallet = await selectAvailableWallet(db);
	assert.deepEqual(wallet, { address: "0x00000000000000000000000000000000000000AA", encryptedPk: encryptedPkA });
});

test("selectAvailableWallet returns null when the pool is exhausted", async () => {
	const db = makeSelectDb([]);
	assert.equal(await selectAvailableWallet(db), null);
});

test("markUsed sets last create and next available timestamps", async () => {
	const createdAt = new Date("2026-05-13T05:00:00.000Z");
	const capture: { set?: Record<string, unknown>; whereCalled?: boolean } = {};
	await markUsed(makeUpdateDb(capture), addressA, createdAt);
	assert.equal(capture.whereCalled, true);
	assert.equal(capture.set?.lastCreateTs, createdAt);
	assert.equal(capture.set?.updatedAt, createdAt);
	assert.equal(
		(capture.set?.nextAvailableTs as Date).toISOString(),
		new Date(createdAt.getTime() + BUNDLE_WALLET_COOLDOWN_SECONDS * 1000).toISOString(),
	);
});

test("bundle wallet key encryption round trips with BUNDLE_KMS_KEY", () => {
	const old = process.env.BUNDLE_KMS_KEY;
	process.env.BUNDLE_KMS_KEY = "a".repeat(64);
	try {
		const pk = `0x${"22".repeat(32)}`;
		const encrypted = encryptBundleWalletPk(pk);
		assert.notEqual(encrypted, pk);
		assert.equal(decryptBundleWalletPk(encrypted), pk);
		assert.match(addressForPrivateKey(pk), /^0x[a-fA-F0-9]{40}$/u);
	} finally {
		if (old == null) delete process.env.BUNDLE_KMS_KEY;
		else process.env.BUNDLE_KMS_KEY = old;
	}
});
