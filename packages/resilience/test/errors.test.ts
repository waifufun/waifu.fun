import assert from "node:assert/strict";
import test from "node:test";

import { CircuitOpenError, ElizaCloudUnavailableError, isRetryableElizaError } from "../src/index.js";

/** Minimal stand-in for apps/api's ElizaApiError (structural match on numeric `status`). */
function apiError(status: number): Error & { status: number } {
	const err = new Error(`eliza ${status}`) as Error & { status: number };
	err.name = "ElizaApiError";
	err.status = status;
	return err;
}

function timeoutError(): Error {
	const err = new Error("timed out");
	err.name = "TimeoutError";
	return err;
}

test("5xx ElizaApiError is retryable (500, 502, 503, 504, 599)", () => {
	for (const status of [500, 502, 503, 504, 599]) {
		assert.equal(isRetryableElizaError(apiError(status)), true, `status ${status} should be retryable`);
	}
});

test("409 adoption is NOT retryable", () => {
	assert.equal(isRetryableElizaError(apiError(409)), false);
});

test("429 rate limit is NOT retryable", () => {
	assert.equal(isRetryableElizaError(apiError(429)), false);
});

test("other 4xx are NOT retryable (400, 401, 403, 404, 422)", () => {
	for (const status of [400, 401, 403, 404, 422]) {
		assert.equal(isRetryableElizaError(apiError(status)), false, `status ${status} should not be retryable`);
	}
});

test("3xx and 2xx are NOT retryable (only 5xx is transient)", () => {
	for (const status of [200, 204, 301, 302]) {
		assert.equal(isRetryableElizaError(apiError(status)), false, `status ${status} should not be retryable`);
	}
});

test("TimeoutError is retryable", () => {
	assert.equal(isRetryableElizaError(timeoutError()), true);
});

test("CircuitOpenError is NOT retryable", () => {
	assert.equal(isRetryableElizaError(new CircuitOpenError("eliza")), false);
});

test("ElizaCloudUnavailableError is NOT retryable", () => {
	assert.equal(isRetryableElizaError(new ElizaCloudUnavailableError()), false);
});

test("unrecognized errors fail closed (not retryable)", () => {
	assert.equal(isRetryableElizaError(new Error("plain")), false);
	assert.equal(isRetryableElizaError("a string"), false);
	assert.equal(isRetryableElizaError(null), false);
	assert.equal(isRetryableElizaError(undefined), false);
	assert.equal(isRetryableElizaError({ status: "500" }), false, "non-numeric status must not be retryable");
});

test("ElizaCloudUnavailableError carries 503 + machine-readable code", () => {
	const err = new ElizaCloudUnavailableError("down", { circuitName: "eliza", cause: new Error("boom") });
	assert.equal(err.httpStatus, 503);
	assert.equal(err.code, "ELIZA_CLOUD_UNAVAILABLE");
	assert.equal(err.circuitName, "eliza");
	assert.ok(err.cause instanceof Error);
	assert.equal(err.name, "ElizaCloudUnavailableError");
	assert.ok(err instanceof Error);
});

test("CircuitOpenError carries its circuit name", () => {
	const err = new CircuitOpenError("eliza-cloud");
	assert.equal(err.circuitName, "eliza-cloud");
	assert.equal(err.name, "CircuitOpenError");
	assert.ok(err instanceof Error);
});
