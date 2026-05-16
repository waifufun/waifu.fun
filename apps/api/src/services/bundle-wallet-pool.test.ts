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
const ORIGINAL_BUNDLE_KMS_KEY = process.env.BUNDLE_KMS_KEY;
const ORIGINAL_BUNDLE_KMS_KEY_HEX = process.env.BUNDLE_KMS_KEY_HEX;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function restoreEnv(): void {
	if (ORIGINAL_BUNDLE_KMS_KEY == null) delete process.env.BUNDLE_KMS_KEY;
	else process.env.BUNDLE_KMS_KEY = ORIGINAL_BUNDLE_KMS_KEY;
	if (ORIGINAL_BUNDLE_KMS_KEY_HEX == null) delete process.env.BUNDLE_KMS_KEY_HEX;
	else process.env.BUNDLE_KMS_KEY_HEX = ORIGINAL_BUNDLE_KMS_KEY_HEX;
	if (ORIGINAL_NODE_ENV == null) delete process.env.NODE_ENV;
	else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
}

function clearBundleKmsKey(): void {
	delete process.env.BUNDLE_KMS_KEY;
	delete process.env.BUNDLE_KMS_KEY_HEX;
}

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
	process.env.BUNDLE_KMS_KEY = "a".repeat(64);
	try {
		const pk = `0x${"22".repeat(32)}`;
		const encrypted = encryptBundleWalletPk(pk);
		assert.match(encrypted, /^bwp:v1:/u);
		assert.notEqual(encrypted, pk);
		assert.equal(decryptBundleWalletPk(encrypted), pk);
		assert.match(addressForPrivateKey(pk), /^0x[a-fA-F0-9]{40}$/u);
	} finally {
		restoreEnv();
	}
});

test("bundle wallet decryption rejects plaintext private keys by default", () => {
	const pk = `0x${"33".repeat(32)}`;
	assert.throws(
		() => decryptBundleWalletPk(pk),
		/re-encrypt existing bundle_wallet_pool\.encrypted_pk rows with encryptBundleWalletPk/u,
	);
	assert.throws(
		() => decryptBundleWalletPk(pk.slice(2)),
		/re-encrypt existing bundle_wallet_pool\.encrypted_pk rows with encryptBundleWalletPk/u,
	);
	assert.equal(decryptBundleWalletPk(pk, { allowPlaintext: true }), pk);
});

test("bundle wallet encryption fails closed in production when BUNDLE_KMS_KEY is absent", () => {
	clearBundleKmsKey();
	process.env.NODE_ENV = "production";
	try {
		assert.throws(
			() => encryptBundleWalletPk(`0x${"44".repeat(32)}`),
			/BUNDLE_KMS_KEY is required in production to encrypt bundle wallet keys/u,
		);
	} finally {
		restoreEnv();
	}
});
