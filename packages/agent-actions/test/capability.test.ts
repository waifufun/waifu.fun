import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	type AgentDescriptorContext,
	type CapabilityDescriptor,
	capabilityFromAdapterSpec,
	hyperliquidPerpsDescriptor,
	pancakeV3Spec,
	polymarketDescriptor,
	taxArbVaultDescriptor,
	venusSpec,
} from "../src/index.js";

/** A descriptor must round-trip through JSON unchanged (no bigint / functions). */
function assertJsonSafe(d: CapabilityDescriptor): void {
	const round = JSON.parse(JSON.stringify(d)) as CapabilityDescriptor;
	assert.deepEqual(round, d, "descriptor is not JSON-safe (lost data on round-trip)");
}

/** Minimal structural invariants every descriptor must hold. */
function assertValidShape(d: CapabilityDescriptor): void {
	assert.ok(typeof d.slug === "string" && d.slug.length > 0);
	assert.ok(typeof d.name === "string" && d.name.length > 0);
	assert.ok(["trading", "lending", "swap", "treasury", "vault", "social", "onchain"].includes(d.category));
	assert.ok(["live", "experimental", "planned", "deprecated"].includes(d.maturity));
	assert.ok(["enabled", "available", "locked"].includes(d.status));
	assert.ok(Array.isArray(d.chains) && d.chains.every((c) => typeof c === "number"));
	assert.ok(Array.isArray(d.actions));
	for (const a of d.actions) {
		assert.ok(typeof a.slug === "string" && a.slug.length > 0);
		assert.ok(["read", "prepare_tx", "client_signed", "agent_signed", "server_job"].includes(a.mode));
		assert.ok(typeof a.requiresConsent === "boolean");
		assert.ok(Array.isArray(a.inputs));
		// gasEstimate must be a string (descriptors are bigint-free).
		if (a.cost?.gasEstimate !== undefined) assert.equal(typeof a.cost.gasEstimate, "string");
	}
}

describe("capabilityFromAdapterSpec", () => {
	it("synthesizes a render-able descriptor from the PancakeSwap v3 spec", () => {
		const d = capabilityFromAdapterSpec(pancakeV3Spec);
		assert.equal(d.slug, "pancakeswap-v3");
		assert.equal(d.category, "swap");
		assert.equal(d.maturity, "live"); // tier: default -> live
		assert.equal(d.adapterSlug, "pancakeswap-v3");
		// swap action is a write -> agent_signed + consent; quote is a read.
		const swap = d.actions.find((a) => a.slug === "swap");
		const quote = d.actions.find((a) => a.slug === "quote");
		assert.ok(swap && swap.mode === "agent_signed" && swap.requiresConsent === true);
		assert.ok(quote && quote.mode === "read" && quote.requiresConsent === false);
		assertValidShape(d);
		assertJsonSafe(d);
	});

	it("synthesizes a descriptor from the Venus spec (lending category)", () => {
		const d = capabilityFromAdapterSpec(venusSpec);
		assert.equal(d.slug, "venus");
		assert.equal(d.category, "lending");
		// accountLiquidity has zero gas -> read.
		const acct = d.actions.find((a) => a.slug === "accountLiquidity");
		assert.ok(acct && acct.mode === "read");
		assertValidShape(d);
		assertJsonSafe(d);
	});

	it("honors status + tag overrides", () => {
		const d = capabilityFromAdapterSpec(pancakeV3Spec, { status: "enabled", tags: ["pinned"] });
		assert.equal(d.status, "enabled");
		assert.ok(d.tags.includes("pinned"));
	});
});

describe("hyperliquid-perps reference descriptor", () => {
	const ctxNoWallet: AgentDescriptorContext = { id: "sol-the-architect", tokenAddress: "0x15fc" };
	const ctxWallet: AgentDescriptorContext = {
		id: "sol-the-architect",
		tokenAddress: "0x15fc",
		hyperliquidWallet: "0xabc",
		stewardAgentId: "sol-waifu",
	};

	it("wraps the live HL routes as data providers (no rip-out)", () => {
		const d = hyperliquidPerpsDescriptor(ctxWallet);
		const endpoints = d.data.map((p) => p.endpoint);
		assert.ok(endpoints.includes("/v2/agents/sol-the-architect/hyperliquid/positions"));
		assert.ok(endpoints.includes("/v2/agents/sol-the-architect/hyperliquid/pnl"));
		assert.ok(endpoints.includes("/v2/agents/sol-the-architect/tax-income"));
		// deposit action wraps the existing patron deposit route.
		const deposit = d.actions.find((a) => a.slug === "deposit");
		assert.equal(deposit?.endpoint, "/v2/agents/sol-the-architect/trading/deposit-quote");
		assert.equal(deposit?.mode, "client_signed");
		assert.equal(deposit?.method, "POST");
		// inputs MUST match the route's required params (incl. fromAddress).
		const depositFields = deposit?.inputs.map((f) => f.name) ?? [];
		for (const f of ["fromChain", "fromToken", "amount", "fromAddress"]) {
			assert.ok(depositFields.includes(f), `deposit input missing ${f}`);
		}
		assert.equal(deposit?.inputs.find((f) => f.name === "fromAddress")?.required, true);

		// set-policy mirrors the live PUT /trading-policy contract (verb + field names).
		const setPolicy = d.actions.find((a) => a.slug === "set-policy");
		assert.equal(setPolicy?.method, "PUT");
		const policyFields = setPolicy?.inputs.map((f) => f.name) ?? [];
		for (const f of ["leverageCap", "perOrderCap", "dailyCap", "allowedAssets", "allowedVenues"]) {
			assert.ok(policyFields.includes(f), `set-policy input missing ${f}`);
		}
	});

	it("reports status from wallet presence", () => {
		assert.equal(hyperliquidPerpsDescriptor(ctxNoWallet).status, "available");
		assert.equal(hyperliquidPerpsDescriptor(ctxWallet).status, "enabled");
	});

	it("marks the HL wallet requirement satisfied only when present", () => {
		const req = (ctx: AgentDescriptorContext) =>
			hyperliquidPerpsDescriptor(ctx).requirements.find((r) => r.id === "hyperliquid-wallet");
		assert.equal(req(ctxNoWallet)?.satisfied, false);
		assert.equal(req(ctxWallet)?.satisfied, true);
		assertValidShape(hyperliquidPerpsDescriptor(ctxWallet));
		assertJsonSafe(hyperliquidPerpsDescriptor(ctxWallet));
	});
});

describe("planned stub descriptors", () => {
	const ctx: AgentDescriptorContext = { id: "sol-the-architect", tokenAddress: "0x15fc" };

	it("polymarket is locked + planned with no execution endpoints", () => {
		const d = polymarketDescriptor(ctx);
		assert.equal(d.maturity, "planned");
		assert.equal(d.status, "locked");
		assert.ok(d.actions.every((a) => a.endpoint === null));
		assertValidShape(d);
		assertJsonSafe(d);
	});

	it("tax-arb-vault is locked + planned (composite)", () => {
		const d = taxArbVaultDescriptor(ctx);
		assert.equal(d.maturity, "planned");
		assert.equal(d.status, "locked");
		assert.equal(d.category, "vault");
		assert.ok(d.actions.every((a) => a.endpoint === null));
		assertValidShape(d);
		assertJsonSafe(d);
	});
});
