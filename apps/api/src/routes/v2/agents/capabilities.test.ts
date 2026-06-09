import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { AgentCapabilitiesResponse, CapabilityDescriptor } from "@waifufun/agent-actions";

import app, { __setCapabilityRouteDepsForTest } from "./capabilities.js";

/**
 * Mock db that answers the two sequential `.select()...limit()` chains the
 * route makes: (1) persona resolution, (2) hyperliquid wallet lookup.
 */
function createMockDb(args: {
	persona?: Record<string, unknown> | undefined;
	wallet?: Record<string, unknown> | undefined;
}) {
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
	};
}

const SOL_TOKEN = "0x15fc6086064afe50ccf4c70000c55cecb6e17777";

const persona = {
	id: "59d85d50-5d44-4b32-bdf7-0a6920a5abac",
	agentId: "sol-the-architect",
	tokenAddress: SOL_TOKEN,
	stewardAgentId: "sol-waifu",
};

function assertValidDescriptor(d: CapabilityDescriptor): void {
	assert.ok(typeof d.slug === "string" && d.slug.length > 0);
	assert.ok(typeof d.name === "string" && d.name.length > 0);
	assert.ok(["trading", "lending", "swap", "treasury", "vault", "social", "onchain"].includes(d.category));
	assert.ok(["live", "experimental", "planned", "deprecated"].includes(d.maturity));
	assert.ok(["enabled", "available", "locked"].includes(d.status));
	assert.ok(Array.isArray(d.actions));
	// descriptor must be JSON-safe (the route serializes it).
	assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
}

describe("GET /:agentId/capabilities", () => {
	afterEach(() => __setCapabilityRouteDepsForTest({ db: undefined }));

	it("503s when the database is unavailable", async () => {
		__setCapabilityRouteDepsForTest({ db: undefined });
		const prev = process.env.DATABASE_URL;
		process.env.DATABASE_URL = "";
		const res = await app.request("/sol-the-architect/capabilities");
		assert.equal(res.status, 503);
		if (prev !== undefined) process.env.DATABASE_URL = prev;
	});

	it("404s for an unknown non-address agent id", async () => {
		__setCapabilityRouteDepsForTest({ db: createMockDb({}) as never });
		const res = await app.request("/does-not-exist/capabilities");
		assert.equal(res.status, 404);
	});

	it("resolves the agent and returns the registered capabilities", async () => {
		__setCapabilityRouteDepsForTest({
			db: createMockDb({ persona, wallet: { address: "0x30641cd7c2e0997acbd8789b86ade9b381da048b" } }) as never,
		});
		const res = await app.request("/sol-the-architect/capabilities");
		assert.equal(res.status, 200);
		const body = (await res.json()) as AgentCapabilitiesResponse;

		// canonical identity echoed back.
		assert.equal(body.agent.id, "sol-the-architect");
		assert.equal(body.agent.tokenAddress, SOL_TOKEN);
		assert.ok(typeof body.ts === "number");

		// the full registered set is present.
		const slugs = body.capabilities.map((c) => c.slug);
		assert.deepEqual(slugs, ["hyperliquid-perps", "pancakeswap-v3", "venus", "polymarket", "tax-arb-vault"]);

		for (const cap of body.capabilities) assertValidDescriptor(cap);
	});

	it("resolves persona uuid identifiers", async () => {
		__setCapabilityRouteDepsForTest({
			db: createMockDb({ persona, wallet: { address: "0x30641cd7c2e0997acbd8789b86ade9b381da048b" } }) as never,
		});
		const res = await app.request("/59d85d50-5d44-4b32-bdf7-0a6920a5abac/capabilities");
		assert.equal(res.status, 200);
		const body = (await res.json()) as AgentCapabilitiesResponse;
		assert.equal(body.agent.id, "sol-the-architect");
		assert.equal(body.agent.tokenAddress, SOL_TOKEN);
	});

	it("marks hyperliquid-perps enabled when a HL wallet is registered", async () => {
		__setCapabilityRouteDepsForTest({
			db: createMockDb({ persona, wallet: { address: "0x30641cd7c2e0997acbd8789b86ade9b381da048b" } }) as never,
		});
		const res = await app.request("/sol-the-architect/capabilities");
		const body = (await res.json()) as AgentCapabilitiesResponse;
		const hl = body.capabilities.find((c) => c.slug === "hyperliquid-perps");
		assert.ok(hl);
		assert.equal(hl.status, "enabled");
		const walletReq = hl.requirements.find((r) => r.id === "hyperliquid-wallet");
		assert.equal(walletReq?.satisfied, true);
		// HL data providers point at the LIVE bespoke routes (no rip-out).
		const positions = hl.data.find((d) => d.view === "positions");
		assert.equal(positions?.endpoint, "/v2/agents/sol-the-architect/hyperliquid/positions");
	});

	it("marks hyperliquid-perps available when no HL wallet exists", async () => {
		__setCapabilityRouteDepsForTest({ db: createMockDb({ persona, wallet: undefined }) as never });
		const res = await app.request("/sol-the-architect/capabilities");
		const body = (await res.json()) as AgentCapabilitiesResponse;
		const hl = body.capabilities.find((c) => c.slug === "hyperliquid-perps");
		assert.equal(hl?.status, "available");
	});

	it("keeps planned capabilities locked with no execution endpoints", async () => {
		__setCapabilityRouteDepsForTest({ db: createMockDb({ persona }) as never });
		const res = await app.request("/sol-the-architect/capabilities");
		const body = (await res.json()) as AgentCapabilitiesResponse;
		for (const slug of ["polymarket", "tax-arb-vault"]) {
			const cap = body.capabilities.find((c) => c.slug === slug);
			assert.ok(cap, `${slug} present`);
			assert.equal(cap.maturity, "planned");
			assert.equal(cap.status, "locked");
			assert.ok(cap.actions.every((a) => a.endpoint === null));
		}
	});
});
