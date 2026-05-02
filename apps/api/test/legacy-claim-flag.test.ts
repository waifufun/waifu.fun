import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import claimRoutes from "../src/routes/v2/claim.js";

const OLD_LEGACY_CLAIM_ENABLED = process.env.LEGACY_CLAIM_ENABLED;
const OLD_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
	if (OLD_LEGACY_CLAIM_ENABLED === undefined) {
		delete process.env.LEGACY_CLAIM_ENABLED;
	} else {
		process.env.LEGACY_CLAIM_ENABLED = OLD_LEGACY_CLAIM_ENABLED;
	}

	if (OLD_DATABASE_URL === undefined) {
		delete process.env.DATABASE_URL;
	} else {
		process.env.DATABASE_URL = OLD_DATABASE_URL;
	}
});

test("legacy claim routes return 410 when LEGACY_CLAIM_ENABLED=false", async () => {
	process.env.LEGACY_CLAIM_ENABLED = "false";
	delete process.env.DATABASE_URL;

	const res = await claimRoutes.request("/prepare", { method: "POST" });

	assert.equal(res.status, 410);
	assert.deepEqual(await res.json(), {
		error: "deprecated",
		message: "claim flow has been removed in v3. provision agents via /v2/launches/:id/authorize",
		docs: "https://docs.waifu.fun/v3/migration",
	});
});

test("legacy claim routes continue to legacy handlers by default", async () => {
	delete process.env.LEGACY_CLAIM_ENABLED;
	delete process.env.DATABASE_URL;

	const res = await claimRoutes.request("/prepare", { method: "POST" });
	const body = (await res.json()) as { error?: string };

	assert.equal(res.status, 401);
	assert.equal(body.error, "AGENT_AUTH_MISSING");
});
