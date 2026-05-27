import assert from "node:assert/strict";
import test from "node:test";

import { createLaunchBodySchema } from "./agent-launches.js";

/**
 * Wave M schema validation tests for `POST /v2/launches`.
 *
 * The full route happy path is exercised by `agent-launches.test.ts`. Here
 * we lock down the new fields:
 *   - platformReceiver is accepted as a body field.
 *   - platformBps + patronBps default to 1000 / 2500.
 *   - agentSafeThreshold defaults to 1.
 *   - validation rejects platformBps + patronBps > 10000.
 *   - validation rejects agentSafeThreshold > agentSafeOwners.length.
 *   - validation rejects platformBps below the 1000 floor.
 */

const CREATOR = "0x1111111111111111111111111111111111111111";
const OWNER_A = "0x2222222222222222222222222222222222222222";
const OWNER_B = "0x3333333333333333333333333333333333333333";
const PLATFORM = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";

function baseBody(overrides: Record<string, unknown> = {}) {
	return {
		name: "Demo Agent",
		symbol: "demo",
		metadataURI: "ipfs://example",
		creator: CREATOR,
		tier: "80",
		siwe: { message: "siwe", signature: "0xsig" },
		...overrides,
	};
}

test("schema applies Wave M defaults when fields omitted", () => {
	const parsed = createLaunchBodySchema.parse(baseBody());
	assert.equal(parsed.platformBps, 1000);
	assert.equal(parsed.patronBps, 2500);
	assert.equal(parsed.agentSafeThreshold, 1);
	assert.equal(parsed.patron, undefined);
	assert.equal(parsed.platformReceiver, undefined);
	assert.equal(parsed.agentSafeOwners, undefined);
});

test("schema accepts flapMetaCid as the launch metadata source", () => {
	const parsed = createLaunchBodySchema.parse(
		baseBody({
			metadataURI: undefined,
			flapMetaCid: "bafkreigh2akiscaildc0123456789",
		}),
	);
	assert.equal(parsed.flapMetaCid, "bafkreigh2akiscaildc0123456789");
	assert.equal(parsed.metadataURI, undefined);
});

test("schema accepts platformReceiver, patron, and multi-owner agent safe", () => {
	const parsed = createLaunchBodySchema.parse(
		baseBody({
			platformReceiver: PLATFORM,
			patron: OWNER_A,
			agentSafeOwners: [OWNER_A, OWNER_B],
			agentSafeThreshold: 2,
			platformBps: 1000,
			patronBps: 2500,
		}),
	);
	assert.equal(parsed.platformReceiver, PLATFORM.toLowerCase());
	assert.equal(parsed.patron, OWNER_A.toLowerCase());
	assert.deepEqual(parsed.agentSafeOwners, [OWNER_A.toLowerCase(), OWNER_B.toLowerCase()]);
	assert.equal(parsed.agentSafeThreshold, 2);
});

test("schema rejects platformBps below the 1000 floor", () => {
	const result = createLaunchBodySchema.safeParse(baseBody({ platformBps: 500 }));
	assert.equal(result.success, false);
});

test("schema rejects platformBps + patronBps > 10000", () => {
	const result = createLaunchBodySchema.safeParse(baseBody({ platformBps: 5000, patronBps: 9000 }));
	assert.equal(result.success, false);
});

test("schema rejects threshold greater than owner count", () => {
	const result = createLaunchBodySchema.safeParse(baseBody({ agentSafeOwners: [OWNER_A], agentSafeThreshold: 2 }));
	assert.equal(result.success, false);
});

test("schema rejects malformed platformReceiver", () => {
	const result = createLaunchBodySchema.safeParse(baseBody({ platformReceiver: "not-an-address" }));
	assert.equal(result.success, false);
});

test("schema deduplicates agentSafeOwners on parse", () => {
	const parsed = createLaunchBodySchema.parse(
		baseBody({
			agentSafeOwners: [OWNER_A, OWNER_A, OWNER_B],
			agentSafeThreshold: 1,
		}),
	);
	assert.deepEqual(parsed.agentSafeOwners, [OWNER_A.toLowerCase(), OWNER_B.toLowerCase()]);
});
