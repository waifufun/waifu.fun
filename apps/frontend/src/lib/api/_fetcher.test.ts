import { describe, expect, it } from "vitest";

import { errorText, extractApiError, isApiError } from "./_fetcher";

/**
 * Regression coverage for React error #31 on the patron page.
 *
 * The waifu-core API's canonical error handler returns
 *   { ok:false, error: { code, message }, requestId }
 * where `error` is an OBJECT. The old apiFetch parser assumed the legacy flat
 * shape `{ error: "STRING" }` and set `ApiError.message = parsed.error`, so
 * `.message` became the raw `{code, message}` object. Any patron component that
 * rendered `error.message` then rendered a raw object child -> React #31.
 *
 * These tests assert the two guards that close the leak:
 *  1. errorText() always returns a STRING (never an object), even if handed an
 *     error whose `.message` is itself a `{code, message}` envelope.
 *  2. isApiError() still recognizes well-formed ApiErrors.
 *
 * Note: extractApiError() is module-internal; it's exercised indirectly here
 * via the message shapes errorText() must survive. The render sites
 * (page.tsx, activity-feed.tsx, x-connection.tsx, policy editors) all route
 * their error through errorText(), so a passing errorText() guarantees no
 * raw-object child reaches React.
 */
describe("errorText (React #31 render guard)", () => {
	it("returns the message string for a normal Error", () => {
		expect(errorText(new Error("boom"))).toBe("boom");
	});

	it("returns the message string for an ApiError-shaped object", () => {
		expect(errorText({ status: 500, message: "upstream exploded" })).toBe("upstream exploded");
	});

	it("never returns an object when .message is a raw {code, message} envelope", () => {
		// This is exactly the pre-fix leak: .message is the API error object.
		const leaked = { status: 500, message: { code: "INTERNAL_SERVER_ERROR", message: "Unexpected API error" } };
		const out = errorText(leaked);
		expect(typeof out).toBe("string");
		// Unwraps the nested string rather than rendering "[object Object]".
		expect(out).toBe("Unexpected API error");
	});

	it("falls back to a string for a bare {code, message} object with no usable message", () => {
		const out = errorText({ code: "X", message: { code: "Y" } });
		expect(typeof out).toBe("string");
	});

	it("falls back for null / undefined / non-object inputs", () => {
		expect(typeof errorText(null)).toBe("string");
		expect(typeof errorText(undefined)).toBe("string");
		expect(errorText("just a string")).toBe("just a string");
		expect(typeof errorText(42)).toBe("string");
	});
});

describe("extractApiError (envelope parse boundary)", () => {
	it("pulls the string message out of the canonical nested {error:{code,message}} envelope", () => {
		const parsed = {
			ok: false,
			error: { code: "INTERNAL_SERVER_ERROR", message: "Unexpected API error" },
			requestId: "req_123",
		};
		const out = extractApiError(parsed, "Internal Server Error", 500);
		expect(out.message).toBe("Unexpected API error");
		expect(typeof out.message).toBe("string");
		expect(out.code).toBe("INTERNAL_SERVER_ERROR");
	});

	it("handles the legacy flat {error:'CODE', message} envelope", () => {
		const out = extractApiError({ error: "STEWARD_ERROR", message: "steward down" }, "Bad Gateway", 502);
		expect(out.message).toBe("steward down");
		expect(out.code).toBe("STEWARD_ERROR");
	});

	it("handles a flat envelope with only an error code string", () => {
		const out = extractApiError({ error: "NOT_FOUND" }, "Not Found", 404);
		expect(out.message).toBe("NOT_FOUND");
		expect(out.code).toBe("NOT_FOUND");
	});

	it("falls back to statusText when no body is present", () => {
		expect(extractApiError(null, "Service Unavailable", 503).message).toBe("Service Unavailable");
	});

	it("never returns a non-string message for any shape", () => {
		const shapes: Record<string, unknown>[] = [
			{ error: { code: "X", message: "y" } },
			{ error: { code: "X" } }, // nested but no message
			{ message: "top-level" },
			{ error: 123 },
			{},
		];
		for (const s of shapes) {
			expect(typeof extractApiError(s, "Err", 500).message).toBe("string");
		}
	});
});

describe("isApiError", () => {
	it("accepts a well-formed ApiError", () => {
		expect(isApiError({ status: 404, message: "not found" })).toBe(true);
	});
	it("rejects a raw envelope (no numeric status / string message)", () => {
		expect(isApiError({ code: "NOT_FOUND", message: "x" })).toBe(false);
		expect(isApiError({ status: 500, message: { code: "X", message: "y" } })).toBe(false);
	});
});
