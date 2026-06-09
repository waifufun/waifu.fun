import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../../middleware/patron-auth.js";
import { __setTradingDepositDepsForTest } from "../agents-trading-deposit.js";
import capabilityActionRoutes, { __setCapabilityActionRouteDepsForTest } from "./capability-actions.js";

/**
 * Generic capability action dispatch tests.
 *
 * Two databases are mocked:
 *   - patron-auth db (__setRequirePatronDbForTest): drives requirePatron +
 *     requireAgentOwnership. select#1 = patron row, select#2 = persona row.
 *   - capability route db (__setCapabilityActionRouteDepsForTest): drives the
 *     route's own resolveAgent (persona) + HL wallet lookup.
 */

const STEWARD_USER_ID = "steward-owner-1";
const OTHER_STEWARD_USER_ID = "steward-stranger-9";
const PERSONA_UUID = "00000000-0000-4000-8000-000000000abc";
const AGENT_SLUG = "sol-the-architect";
const SOL_TOKEN = "0x15fc6086064afe50ccf4c70000c55cecb6e17777";
const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111";
const HL_WALLET = "0x30641cd7c2e0997acbd8789b86ade9b381da048b";
const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

type PersonaRow = {
	id: string;
	agentId: string;
	tokenAddress: string | null;
	stewardAgentId: string | null;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};

const OWNED_PERSONA: PersonaRow = {
	id: PERSONA_UUID,
	agentId: AGENT_SLUG,
	tokenAddress: SOL_TOKEN,
	stewardAgentId: "sol-waifu",
	ownerStewardUserId: STEWARD_USER_ID,
	ownerAddress: OWNER_ADDRESS,
};

/** patron-auth db: select#1 = patron, select#2 = persona-by-id. */
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

/** capability route db: select#1 = persona resolution, select#2 = HL wallet. */
function fakeCapabilityDb(args: { persona?: PersonaRow | undefined; wallet?: { address: string } | undefined }) {
	let call = 0;
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => {
						call += 1;
						if (call === 1) return args.persona ? [args.persona] : [];
						return args.wallet ? [args.wallet] : [];
					},
				}),
			}),
		}),
	} as never;
}

function ownerParser(): StewardParser {
	return (async () => ({ userId: STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}
function strangerParser(): StewardParser {
	return (async () => ({ userId: OTHER_STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}

function makeApp() {
	const app = new Hono();
	app.route("/v2/agents", capabilityActionRoutes);
	return app;
}

function dispatch(
	app: Hono,
	capabilitySlug: string,
	actionSlug: string,
	body?: unknown,
	{ id = AGENT_SLUG, token = "owner-token" }: { id?: string; token?: string } = {},
) {
	return app.request(`http://x/v2/agents/${id}/capabilities/${capabilitySlug}/actions/${actionSlug}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
}

/** A valid, owner-authorized setup that resolves cleanly through both dbs. */
function setupOwned() {
	__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
	__setRequirePatronStewardParserForTest(ownerParser());
	__setCapabilityActionRouteDepsForTest({
		db: fakeCapabilityDb({ persona: OWNED_PERSONA, wallet: { address: HL_WALLET } }),
	});
}

describe("POST /:id/capabilities/:capabilitySlug/actions/:actionSlug", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setCapabilityActionRouteDepsForTest({ db: undefined });
		__setTradingDepositDepsForTest({ lifi: undefined });
	});

	it("401s an unauthenticated caller", async () => {
		setupOwned();
		__setRequirePatronStewardParserForTest((async () => null) as unknown as StewardParser);
		const app = makeApp();
		const res = await app.request(`http://x/v2/agents/${AGENT_SLUG}/capabilities/hyperliquid-perps/actions/deposit`, {
			method: "POST",
		});
		assert.equal(res.status, 401);
	});

	it("403s a non-owner patron", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA, OTHER_STEWARD_USER_ID));
		__setRequirePatronStewardParserForTest(strangerParser());
		__setCapabilityActionRouteDepsForTest({
			db: fakeCapabilityDb({ persona: OWNED_PERSONA, wallet: { address: HL_WALLET } }),
		});
		const app = makeApp();
		const res = await dispatch(app, "hyperliquid-perps", "deposit", { consent: true });
		assert.equal(res.status, 403);
	});

	it("404s an unknown capability", async () => {
		setupOwned();
		const app = makeApp();
		const res = await dispatch(app, "does-not-exist", "deposit", {});
		assert.equal(res.status, 404);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "CAPABILITY_NOT_FOUND");
	});

	it("404s an unknown action on a known capability", async () => {
		setupOwned();
		const app = makeApp();
		const res = await dispatch(app, "hyperliquid-perps", "no-such-action", {});
		assert.equal(res.status, 404);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "ACTION_NOT_FOUND");
	});

	it("400s when the body fails the action input schema", async () => {
		setupOwned();
		const app = makeApp();
		// deposit requires fromChain/fromToken/amount/fromAddress; omit them.
		const res = await dispatch(app, "hyperliquid-perps", "deposit", { consent: true, amount: "not-a-number" });
		assert.equal(res.status, 400);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "INVALID_INPUT");
	});

	it("403s a consent-required action when no consent flag is present", async () => {
		setupOwned();
		const app = makeApp();
		// Valid inputs, but no `consent` → CONSENT_REQUIRED (deposit.requiresConsent).
		const res = await dispatch(app, "hyperliquid-perps", "deposit", {
			fromChain: 42161,
			fromToken: ARB_USDC,
			amount: "10000000",
			fromAddress: OWNER_ADDRESS,
		});
		assert.equal(res.status, 403);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "CONSENT_REQUIRED");
	});

	it("returns an unsigned tx for the Hyperliquid deposit (prepare_tx, no signing)", async () => {
		setupOwned();
		const app = makeApp();
		const res = await dispatch(app, "hyperliquid-perps", "deposit", {
			consent: true,
			fromChain: 42161,
			fromToken: ARB_USDC,
			amount: "10000000",
			fromAddress: OWNER_ADDRESS,
		});
		assert.equal(res.status, 200);
		const json = (await res.json()) as {
			ok: boolean;
			data: { quote: { depositTx: { to: string; from: string; value: string; data: string } } };
		};
		assert.equal(json.ok, true);
		const tx = json.data.quote.depositTx;
		// unsigned tx object: to + data + value, NO signature, NO execution.
		assert.equal(typeof tx.to, "string");
		assert.equal(typeof tx.data, "string");
		assert.ok(tx.data.startsWith("0x"));
		assert.equal(tx.value, "0");
		assert.equal(tx.from.toLowerCase(), OWNER_ADDRESS.toLowerCase());
	});

	it("returns the SAME unsigned tx as the bespoke deposit route", async () => {
		const depositBody = {
			fromChain: 42161,
			fromToken: ARB_USDC,
			amount: "10000000",
			fromAddress: OWNER_ADDRESS,
		};

		// 1) generic dispatch result.
		setupOwned();
		const genericApp = makeApp();
		const genericRes = await dispatch(genericApp, "hyperliquid-perps", "deposit", { consent: true, ...depositBody });
		assert.equal(genericRes.status, 200);
		const genericJson = (await genericRes.json()) as {
			data: { quote: { depositTx: unknown } };
		};

		// 2) bespoke route result (mount the live route, same auth + db).
		const { default: tradingDepositRoutes } = await import("../agents-trading-deposit.js");
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		const bespokeApp = new Hono();
		bespokeApp.route("/v2/agents", tradingDepositRoutes);
		const bespokeRes = await bespokeApp.request(`http://x/v2/agents/${AGENT_SLUG}/trading/deposit-quote`, {
			method: "POST",
			headers: { "Content-Type": "application/json", authorization: "Bearer owner-token" },
			body: JSON.stringify(depositBody),
		});
		assert.equal(bespokeRes.status, 200);
		const bespokeJson = (await bespokeRes.json()) as { data: { quote: { depositTx: unknown } } };

		// The unsigned tx object is identical through both surfaces.
		assert.deepEqual(genericJson.data.quote.depositTx, bespokeJson.data.quote.depositTx);
	});

	it("501s a server_job action (set-policy) — not yet available", async () => {
		setupOwned();
		const app = makeApp();
		const res = await dispatch(app, "hyperliquid-perps", "set-policy", { consent: true, leverageCap: 3 });
		assert.equal(res.status, 501);
		const json = (await res.json()) as { error: string; message: string };
		assert.equal(json.message, "not yet available");
	});

	it("501s an agent_signed planned action (polymarket place-order)", async () => {
		setupOwned();
		const app = makeApp();
		// polymarket place-order is mode agent_signed + requiresConsent.
		const res = await dispatch(app, "polymarket", "place-order", { consent: true });
		assert.equal(res.status, 501);
	});
});
