import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWaitlistResponse, postWaitlistSignup } from "./use-launchpads";

describe("parseWaitlistResponse", () => {
	it("treats successful waitlist responses as a created signup", () => {
		expect(parseWaitlistResponse(201)).toEqual({ ok: true, status: "created", email: "" });
	});

	it("treats duplicate waitlist responses as already joined", () => {
		expect(parseWaitlistResponse(409)).toEqual({ ok: true, status: "already", email: "" });
		expect(parseWaitlistResponse(400, { code: "already_joined" })).toEqual({ ok: true, status: "already", email: "" });
	});

	it("maps validation and rate-limit errors to safe UI copy", () => {
		expect(parseWaitlistResponse(422, { message: "invalid email" })).toEqual({ ok: false, error: "invalid email" });
		expect(parseWaitlistResponse(429)).toEqual({ ok: false, error: "too many attempts. wait a minute and try again." });
	});

	it("does not treat missing backend routes as local success", () => {
		expect(parseWaitlistResponse(404)).toEqual({
			ok: false,
			error: "waitlist is not available for this launchpad yet.",
		});
	});
});

describe("postWaitlistSignup", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("normalizes email and posts the waitlist payload to the v3 route", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			status: 201,
			json: async () => ({}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await postWaitlistSignup("pump-fun", " Creator@Example.COM ");

		expect(result).toEqual({ ok: true, status: "created", email: "creator@example.com" });
		expect(fetchMock).toHaveBeenCalledWith("https://api.waifu.fun/v3/launchpads/pump-fun/waitlist", {
			method: "POST",
			headers: { "content-type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ email: "creator@example.com" }),
		});
	});

	it("rejects invalid email locally without calling the backend", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const result = await postWaitlistSignup("bags", "not-an-email");

		expect(result).toEqual({ ok: false, error: "enter a valid email address." });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
