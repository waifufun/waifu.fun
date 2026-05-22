import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as jose from "jose";

import { verifyStewardJwt } from "./steward-auth.js";

const STEWARD_SECRET = "x".repeat(64);
const STEWARD_USER_ID = "steward-user-issue-9";

async function signStewardJwt(claims: Record<string, unknown>) {
	return new jose.SignJWT(claims)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuer("steward")
		.setSubject(STEWARD_USER_ID)
		.sign(new TextEncoder().encode(STEWARD_SECRET));
}

describe("verifyStewardJwt tenant binding", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.STEWARD_JWT_SECRET = STEWARD_SECRET;
		process.env.STEWARD_TENANT_ID = "waifu";
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("accepts a token only when tenantId exactly matches STEWARD_TENANT_ID", async () => {
		const token = await signStewardJwt({ userId: STEWARD_USER_ID, tenantId: "waifu" });

		const principal = await verifyStewardJwt(token);

		assert.equal(principal?.userId, STEWARD_USER_ID);
		assert.equal(principal?.tenantId, "waifu");
	});

	it("rejects personal tenant tokens as waifu sessions", async () => {
		const token = await signStewardJwt({
			userId: STEWARD_USER_ID,
			tenantId: `personal-${STEWARD_USER_ID}`,
		});

		const principal = await verifyStewardJwt(token);

		assert.equal(principal, null);
	});

	it("rejects otherwise valid tokens when STEWARD_TENANT_ID is not configured", async () => {
		delete process.env.STEWARD_TENANT_ID;
		const token = await signStewardJwt({ userId: STEWARD_USER_ID, tenantId: "waifu" });

		const principal = await verifyStewardJwt(token);

		assert.equal(principal, null);
	});
});
