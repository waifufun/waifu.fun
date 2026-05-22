import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as finalizePost } from "./finalize/route";
import { POST as logoutPost } from "./logout/route";

const makeJsonRequest = (body: unknown, cookie = "") =>
	new NextRequest("https://www.waifu.fun/api/auth/finalize", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});

describe("same-origin auth API routes", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { return_to: "/patron" } }), { status: 200 })),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("rejects malformed finalize payloads before touching upstream auth", async () => {
		const response = await finalizePost(makeJsonRequest({ provider: "email" }));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ ok: false, error: "BAD_REQUEST" });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("proxies supported finalize providers to their concrete upstream endpoints", async () => {
		const providers = [
			{ provider: "email", body: { token: "email-token", email: "test@waifu.fun" }, path: "/auth/email/finalize" },
			{ provider: "passkey", body: { token: "passkey-token" }, path: "/auth/passkey/finalize" },
			{ provider: "oauth", body: { token: "oauth-token" }, path: "/auth/oauth/finalize" },
			{ provider: "twitter", body: { code: "twitter-code" }, path: "/auth/twitter/finalize" },
		] as const;

		for (const entry of providers) {
			const response = await finalizePost(
				makeJsonRequest({ provider: entry.provider, ...entry.body }, "wf_return=/patron"),
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("set-cookie")).toContain("wf_authed=1");
			expect(fetch).toHaveBeenLastCalledWith(
				`https://api.waifu.fun${entry.path}`,
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ Cookie: "wf_return=/patron" }),
				}),
			);
		}
	});

	it("logs out both backend session families and expires the frontend auth flag", async () => {
		const response = await logoutPost(
			new NextRequest("https://www.waifu.fun/api/auth/logout", {
				method: "POST",
				headers: { cookie: "wf_session=session" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, data: { loggedOut: true } });
		expect(response.headers.get("set-cookie")).toContain("wf_authed=; Max-Age=0");
		expect(fetch).toHaveBeenCalledWith(
			"https://api.waifu.fun/auth/oauth/logout",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetch).toHaveBeenCalledWith(
			"https://api.waifu.fun/auth/twitter/logout",
			expect.objectContaining({ method: "POST" }),
		);
	});
});
