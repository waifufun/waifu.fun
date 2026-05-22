import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import pino from "pino";

import { logAgentEventToLoki, loggerRedactionConfig, redactLogSecrets } from "../src/index.js";

function captureLog(line: Record<string, unknown>): Record<string, unknown> {
	let output = "";
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			output += chunk.toString();
			callback();
		},
	});
	const logger = pino(
		{
			base: undefined,
			redact: loggerRedactionConfig,
			formatters: { log: redactLogSecrets },
		},
		stream,
	);

	logger.info(line, "redaction test");
	return JSON.parse(output) as Record<string, unknown>;
}

test("logger redacts common secret fields from emitted JSON", () => {
	const logged = captureLog({
		authorization: "Bearer top-secret",
		headers: { authorization: "Bearer header-secret" },
		apiKey: "agk_secret",
		token: "oauth-token",
		secret: "shared-secret",
		privateKey: "0xabc",
		encryptedAccessToken: { iv: "iv", data: "ciphertext" },
	});

	assert.equal(logged.authorization, "[Redacted]");
	assert.deepEqual(logged.headers, { authorization: "[Redacted]" });
	assert.equal(logged.apiKey, "[Redacted]");
	assert.equal(logged.token, "[Redacted]");
	assert.equal(logged.secret, "[Redacted]");
	assert.equal(logged.privateKey, "[Redacted]");
	assert.equal(logged.encryptedAccessToken, "[Redacted]");
	assert.equal(JSON.stringify(logged).includes("top-secret"), false);
	assert.equal(JSON.stringify(logged).includes("ciphertext"), false);
});

test("logger redacts secret fields inside event payloads", () => {
	const logged = captureLog({
		event: {
			type: "agent.created",
			payload: {
				apiKey: "nested-api-key",
				auth: {
					token: "nested-token",
					privateKey: "nested-private-key",
					encryptedRefreshToken: "nested-envelope",
				},
			},
		},
	});

	assert.deepEqual(logged.event, {
		type: "agent.created",
		payload: {
			apiKey: "[Redacted]",
			auth: {
				token: "[Redacted]",
				privateKey: "[Redacted]",
				encryptedRefreshToken: "[Redacted]",
			},
		},
	});
	assert.equal(JSON.stringify(logged).includes("nested-token"), false);
	assert.equal(JSON.stringify(logged).includes("nested-envelope"), false);
});

test("logAgentEventToLoki redacts direct event payload pushes", async () => {
	const originalFetch = globalThis.fetch;
	let requestBody = "";
	globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
		requestBody = String(init?.body ?? "");
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	try {
		logAgentEventToLoki({
			lokiUrl: "https://logs.example",
			service: "test",
			line: {
				event: {
					payload: {
						authorization: "Bearer direct-secret",
						encryptedRefreshToken: "direct-envelope",
					},
				},
			},
			timestamp: new Date("2026-01-01T00:00:00.000Z"),
		});
		await new Promise((resolve) => setImmediate(resolve));
	} finally {
		globalThis.fetch = originalFetch;
	}

	assert.notEqual(requestBody, "");
	assert.equal(requestBody.includes("direct-secret"), false);
	assert.equal(requestBody.includes("direct-envelope"), false);
	assert.equal(requestBody.includes("[Redacted]"), true);
});
