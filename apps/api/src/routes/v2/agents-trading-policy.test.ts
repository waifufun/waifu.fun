import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../middleware/patron-auth.js";
import {
	type StewardClient,
	StewardError,
	type StewardPolicyCaps,
	type StewardPolicyRule,
} from "../../services/agent-launch/steward.js";
import agentTradingPolicyRoutes, { __setTradingPolicyStewardForTest } from "./agents-trading-policy.js";

const STEWARD_USER_ID = "steward-owner-1";
const OTHER_STEWARD_USER_ID = "steward-stranger-9";
const PERSONA_UUID = "00000000-0000-4000-8000-000000000abc";
const AGENT_SLUG = "waifu-suki-001";

type PersonaRow = {
	id: string;
	agentId: string;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};

const OWNED_PERSONA: PersonaRow = {
	id: PERSONA_UUID,
	agentId: AGENT_SLUG,
	ownerStewardUserId: STEWARD_USER_ID,
	ownerAddress: null,
};

// Mirrors the fake patron-auth db used by agents-chat.test.ts: select #1 is the
// patron_users lookup, select #2 is agent_personas-by-id.
function fakePatronAuthDb(persona: PersonaRow | null, callerStewardId: string = STEWARD_USER_ID) {
	const patronRow = {
		id: "patron-row-1",
		stewardUserId: callerStewardId,
		primaryEmail: null,
		xUserId: `steward:${callerStewardId}`,
		xHandle: `steward:${callerStewardId}`,
	};
	let call = 0;
	function builder() {
		const current = call;
		call += 1;
		const b = {
			from() {
				return b;
			},
			where() {
				return b;
			},
			limit() {
				if (current === 0) return Promise.resolve([patronRow]);
				return Promise.resolve(persona ? [persona] : []);
			},
		};
		return b;
	}
	return { select: () => builder() } as never;
}

function ownerParser(): StewardParser {
	return (async () => ({ userId: STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}
function strangerParser(): StewardParser {
	return (async () => ({ userId: OTHER_STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}

type StewardStub = {
	caps?: StewardPolicyCaps | (() => never);
	rules?: StewardPolicyRule[] | (() => never);
	lastPutCaps?: StewardPolicyCaps;
	lastPutRules?: StewardPolicyRule[];
	lastAgentId?: string;
};

function fakeSteward(stub: StewardStub): StewardClient {
	return {
		async getPolicy(agentId: string) {
			stub.lastAgentId = agentId;
			if (typeof stub.caps === "function") return stub.caps();
			return stub.caps ?? {};
		},
		async putPolicy(agentId: string, caps: StewardPolicyCaps) {
			stub.lastAgentId = agentId;
			stub.lastPutCaps = caps;
			return caps;
		},
		async getPolicies(agentId: string) {
			stub.lastAgentId = agentId;
			if (typeof stub.rules === "function") return stub.rules();
			return stub.rules ?? [];
		},
		async putPolicies(agentId: string, rules: StewardPolicyRule[]) {
			stub.lastAgentId = agentId;
			stub.lastPutRules = rules;
			return rules;
		},
	} as unknown as StewardClient;
}

function makeApp() {
	const app = new Hono();
	app.route("/v2/agents", agentTradingPolicyRoutes);
	return app;
}

function req(app: Hono, method: string, suffix: string, body?: unknown, token = "owner-token") {
	return app.request(`http://x/v2/agents/${PERSONA_UUID}/${suffix}`, {
		method,
		headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
}

describe("trading-policy proxy", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setTradingPolicyStewardForTest(undefined);
	});

	it("rejects an unauthenticated caller with 401", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest((async () => null) as unknown as StewardParser);
		__setTradingPolicyStewardForTest(fakeSteward({ caps: { dailyCap: 100 } }));
		const app = makeApp();
		const res = await app.request(`http://x/v2/agents/${PERSONA_UUID}/trading-policy`, { method: "GET" });
		assert.equal(res.status, 401);
	});

	it("rejects a non-owner patron with 403", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA, OTHER_STEWARD_USER_ID));
		__setRequirePatronStewardParserForTest(strangerParser());
		__setTradingPolicyStewardForTest(fakeSteward({ caps: { dailyCap: 100 } }));
		const app = makeApp();
		const res = await req(app, "GET", "trading-policy");
		assert.equal(res.status, 403);
	});

	it("returns caps for the owner and forwards the agent slug", async () => {
		const stub: StewardStub = { caps: { dailyCap: 100, leverageCap: 3, allowedAssets: ["BTC"] } };
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setTradingPolicyStewardForTest(fakeSteward(stub));
		const app = makeApp();
		const res = await req(app, "GET", "trading-policy");
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; policy: StewardPolicyCaps };
		assert.equal(json.ok, true);
		assert.equal(json.policy.dailyCap, 100);
		assert.equal(stub.lastAgentId, AGENT_SLUG);
	});

	it("treats a Steward 404 on caps as empty policy", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setTradingPolicyStewardForTest(
			fakeSteward({
				caps: () => {
					throw new StewardError("not found", 404);
				},
			}),
		);
		const app = makeApp();
		const res = await req(app, "GET", "trading-policy");
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; policy: StewardPolicyCaps };
		assert.deepEqual(json.policy, {});
	});

	it("sanitizes caps on PUT (drops negatives, keeps valid)", async () => {
		const stub: StewardStub = {};
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setTradingPolicyStewardForTest(fakeSteward(stub));
		const app = makeApp();
		const res = await req(app, "PUT", "trading-policy", {
			dailyCap: 250,
			perOrderCap: -5,
			leverageCap: 2,
			allowedAssets: ["BTC", "", "ETH"],
			allowedVenues: ["pancake"],
		});
		assert.equal(res.status, 200);
		assert.equal(stub.lastPutCaps?.dailyCap, 250);
		// negative per-order cap is dropped entirely
		assert.equal(stub.lastPutCaps?.perOrderCap, undefined);
		assert.deepEqual(stub.lastPutCaps?.allowedAssets, ["BTC", "ETH"]);
	});

	it("saves the withdraw whitelist rule on PUT /trading-policies", async () => {
		const stub: StewardStub = {};
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setTradingPolicyStewardForTest(fakeSteward(stub));
		const app = makeApp();
		const res = await req(app, "PUT", "trading-policies", {
			policies: [{ type: "approved-addresses", addresses: ["0x1111111111111111111111111111111111111111"] }],
		});
		assert.equal(res.status, 200);
		assert.equal(stub.lastPutRules?.[0]?.type, "approved-addresses");
		assert.deepEqual(stub.lastPutRules?.[0]?.addresses, ["0x1111111111111111111111111111111111111111"]);
	});

	it("rejects a rule without a string type", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setTradingPolicyStewardForTest(fakeSteward({}));
		const app = makeApp();
		const res = await req(app, "PUT", "trading-policies", { policies: [{ addresses: ["0xabc"] }] });
		assert.equal(res.status, 400);
	});
});
