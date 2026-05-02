import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	__setPatronAuthDbForTest,
	__setPatronAuthSessionResolverForTest,
	requirePatronLaunchAuth,
} from "./legacy-patron-launch-auth.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function fakeDb(row: Record<string, unknown> | null) {
	return {
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
	};
}

async function request(cookie?: string) {
	const app = new Hono();
	app.post("/launches/:id/authorize", requirePatronLaunchAuth() as never, (c) =>
		c.json({ wallet: (c as unknown as { get(key: "patronWallet"): string }).get("patronWallet") }),
	);

	const headers = new Headers();
	if (cookie) headers.set("cookie", cookie);

	return app.request("http://unit.test/launches/launch-1/authorize", {
		method: "POST",
		headers,
	});
}

describe("patron launch auth middleware", () => {
	afterEach(() => {
		__setPatronAuthDbForTest(undefined);
		__setPatronAuthSessionResolverForTest(undefined);
	});

	it("401s when the SIWE session cookie is missing", async () => {
		__setPatronAuthDbForTest(fakeDb(null));
		const res = await request();
		assert.equal(res.status, 401);
	});

	it("403s when the SIWE wallet does not match agent_personas.owner_address", async () => {
		__setPatronAuthSessionResolverForTest(async () => OTHER);
		__setPatronAuthDbForTest(
			fakeDb({
				launchId: "launch-1",
				agentId: "persona-uuid",
				personaUuid: "persona-uuid",
				personaAgentId: "waifu-test",
				ownerAddress: OWNER,
			}),
		);

		const res = await request("wf_session=test-token");
		assert.equal(res.status, 403);
	});

	it("attaches the patron wallet when the owner check passes", async () => {
		__setPatronAuthSessionResolverForTest(async () => OWNER);
		__setPatronAuthDbForTest(
			fakeDb({
				launchId: "launch-1",
				agentId: "persona-uuid",
				personaUuid: "persona-uuid",
				personaAgentId: "waifu-test",
				ownerAddress: OWNER,
			}),
		);

		const res = await request("wf_session=test-token");
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { wallet: "0x1111111111111111111111111111111111111111" });
	});
});
