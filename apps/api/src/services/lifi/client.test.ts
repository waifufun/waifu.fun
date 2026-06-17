import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { LifiClient, resolveLifiIntegratorFee } from "./client.js";

const okResponse = () =>
	new Response(JSON.stringify({ estimate: {}, action: {}, transactionRequest: {} }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});

describe("LI.FI integrator fee", () => {
	it("defaults to 0 when env is unset", () => {
		assert.equal(resolveLifiIntegratorFee({}), 0);
	});

	it("reads a fractional fee from env", () => {
		assert.equal(resolveLifiIntegratorFee({ LIFI_INTEGRATOR_FEE: "0.002" }), 0.002);
	});

	it("clamps to the 1% ceiling", () => {
		assert.equal(resolveLifiIntegratorFee({ LIFI_INTEGRATOR_FEE: "0.5" }), 0.01);
	});

	it("ignores negative / non-numeric values (falls back to 0)", () => {
		assert.equal(resolveLifiIntegratorFee({ LIFI_INTEGRATOR_FEE: "-1" }), 0);
		assert.equal(resolveLifiIntegratorFee({ LIFI_INTEGRATOR_FEE: "abc" }), 0);
		assert.equal(resolveLifiIntegratorFee({ LIFI_INTEGRATOR_FEE: "" }), 0);
	});

	it("passes the configured fee into the quote request", async () => {
		let capturedUrl = "";
		const fetchImpl = (async (url: string | URL | Request) => {
			capturedUrl = String(url);
			return okResponse();
		}) as unknown as typeof fetch;

		const client = new LifiClient({ apiKey: "k", integratorFee: 0.002, fetchImpl });
		await client.getQuote({
			fromChain: 56,
			toChain: 56,
			fromToken: "0xa",
			toToken: "0xb",
			fromAmount: "1000",
			fromAddress: "0xfrom",
			toAddress: "0xto",
		});
		assert.ok(capturedUrl.includes("fee=0.002"), `expected fee=0.002 in ${capturedUrl}`);
	});

	it("defaults the quote fee to 0 when unconfigured", async () => {
		let capturedUrl = "";
		const fetchImpl = (async (url: string | URL | Request) => {
			capturedUrl = String(url);
			return okResponse();
		}) as unknown as typeof fetch;

		const client = new LifiClient({ apiKey: "k", fetchImpl });
		await client.getQuote({
			fromChain: 56,
			toChain: 56,
			fromToken: "0xa",
			toToken: "0xb",
			fromAmount: "1000",
			fromAddress: "0xfrom",
			toAddress: "0xto",
		});
		assert.ok(capturedUrl.includes("fee=0"), `expected fee=0 in ${capturedUrl}`);
	});
});
