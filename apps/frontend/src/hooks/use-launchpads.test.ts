import { describe, expect, it } from "vitest";
import { parseWaitlistResponse } from "./use-launchpads";

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
