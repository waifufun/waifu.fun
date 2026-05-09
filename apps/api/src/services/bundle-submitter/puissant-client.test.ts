import assert from "node:assert/strict";
import test from "node:test";

import { PuissantRpcError, createPuissantClient } from "./puissant-client.js";

function makeFetch(handler: (req: { url: string; body: unknown }) => Response | Promise<Response>): typeof fetch {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		return handler({ url: String(url), body });
	}) as unknown as typeof fetch;
}

test("sendPrivateRawTransaction posts a JSON-RPC envelope and returns the result hash", async () => {
	let captured: unknown = null;
	const client = createPuissantClient({
		endpoint: "https://test.puissant.local",
		fetchImpl: makeFetch(({ body }) => {
			captured = body;
			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					result: "0xabc123",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}),
	});

	const hash = await client.sendPrivateRawTransaction("0xdeadbeef");
	assert.equal(hash, "0xabc123");
	assert.deepEqual(captured, {
		jsonrpc: "2.0",
		id: 1,
		method: "eth_sendPrivateTransaction",
		params: ["0xdeadbeef"],
	});
});

test("sendPrivateRawTransaction uses the documented Puissant private transaction method", async () => {
	let capturedMethod: unknown = null;
	const client = createPuissantClient({
		endpoint: "https://test.puissant.local",
		fetchImpl: makeFetch(({ body }) => {
			capturedMethod = (body as { method?: unknown }).method;
			return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xabc123" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}),
	});

	await client.sendPrivateRawTransaction("0xdeadbeef");
	assert.equal(capturedMethod, "eth_sendPrivateTransaction");
});

test("sendPrivateRawTransaction throws PuissantRpcError on JSON-RPC error", async () => {
	const client = createPuissantClient({
		endpoint: "https://test.puissant.local",
		fetchImpl: makeFetch(
			() =>
				new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						error: { code: -32000, message: "gas price too low" },
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		),
	});

	await assert.rejects(client.sendPrivateRawTransaction("0xdead"), (err) => {
		assert.ok(err instanceof PuissantRpcError);
		assert.equal((err as PuissantRpcError).code, -32000);
		assert.match((err as Error).message, /gas price too low/);
		return true;
	});
});

test("sendPrivateRawTransaction throws on HTTP error", async () => {
	const client = createPuissantClient({
		endpoint: "https://test.puissant.local",
		fetchImpl: makeFetch(() => new Response("upstream down", { status: 502 })),
	});

	await assert.rejects(client.sendPrivateRawTransaction("0xdead"), /puissant http 502/);
});

test("sendPrivateRawTransaction rejects non-hex input", async () => {
	const client = createPuissantClient({
		endpoint: "https://test.puissant.local",
		fetchImpl: makeFetch(() => new Response("{}", { status: 200 })),
	});

	await assert.rejects(client.sendPrivateRawTransaction("nope"), /0x-prefixed/);
});

test("sendPrivateRawTransaction treats `0x` placeholder as failure", async () => {
	const client = createPuissantClient({
		endpoint: "https://test.puissant.local",
		fetchImpl: makeFetch(
			() =>
				new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		),
	});

	await assert.rejects(client.sendPrivateRawTransaction("0xdead"), /unexpected result/);
});
