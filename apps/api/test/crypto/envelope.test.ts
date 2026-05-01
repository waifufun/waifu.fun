import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, test } from "node:test";

import { decryptEnvelope, encryptEnvelope } from "../../src/lib/crypto/envelope.js";

const originalEnv = {
	X_TOKEN_KEK_HEX: process.env.X_TOKEN_KEK_HEX,
	X_TOKEN_KEKS_HEX: process.env.X_TOKEN_KEKS_HEX,
	X_TOKEN_KEK_ACTIVE: process.env.X_TOKEN_KEK_ACTIVE,
};

function keyHex(): string {
	return randomBytes(32).toString("hex");
}

afterEach(() => {
	for (const [name, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
});

test("roundtrips with the active keyed KEK", () => {
	const kek1 = keyHex();
	const kek2 = keyHex();
	process.env.X_TOKEN_KEKS_HEX = `kek1=${kek1},kek2=${kek2}`;
	process.env.X_TOKEN_KEK_ACTIVE = "kek2";
	delete process.env.X_TOKEN_KEK_HEX;

	const envelope = encryptEnvelope("secret-access-token");

	assert.equal(envelope.keyRef, "kek2");
	assert.equal(decryptEnvelope(envelope), "secret-access-token");
});

test("wrong key fails authentication", () => {
	process.env.X_TOKEN_KEK_HEX = keyHex();
	delete process.env.X_TOKEN_KEKS_HEX;
	delete process.env.X_TOKEN_KEK_ACTIVE;
	const envelope = encryptEnvelope("secret-refresh-token");

	process.env.X_TOKEN_KEK_HEX = keyHex();

	assert.throws(() => decryptEnvelope(envelope));
});

test("missing key throws", () => {
	delete process.env.X_TOKEN_KEK_HEX;
	delete process.env.X_TOKEN_KEKS_HEX;
	delete process.env.X_TOKEN_KEK_ACTIVE;

	assert.throws(() => encryptEnvelope("secret"), /Missing X token KEK/);
});
