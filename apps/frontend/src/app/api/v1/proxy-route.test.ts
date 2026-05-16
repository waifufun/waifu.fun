import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./[...path]/route";

describe("frontend API proxy route", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202, headers: { "x-upstream": "yes" } })),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("forwards GET path, query string, and forwarding headers to the backend", async () => {
		const response = await GET(new Request("https://www.waifu.fun/api/v1/v2/agents?limit=5"), {
			params: Promise.resolve({ path: ["v2", "agents"] }),
		});

		expect(response.status).toBe(202);
		const init = vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit;
		expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toBe("http://89.167.63.246:3100/v2/agents?limit=5");
		expect(init).toMatchObject({ method: "GET", redirect: "manual" });
		expect(init.headers).toBeInstanceOf(Headers);
		expect((init.headers as Headers).get("x-forwarded-host")).toBe("www.waifu.fun");
		expect((init.headers as Headers).get("x-forwarded-proto")).toBe("https");
	});

	it("forwards POST request bodies and strips hop-by-hop headers", async () => {
		await POST(
			new Request("https://www.waifu.fun/api/v1/v2/launches", {
				method: "POST",
				headers: { connection: "keep-alive", "content-type": "application/json" },
				body: JSON.stringify({ name: "Launch" }),
			}),
			{ params: Promise.resolve({ path: ["v2", "launches"] }) },
		);

		const init = vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit;
		expect(init.body).toBe(JSON.stringify({ name: "Launch" }));
		expect((init.headers as Headers).get("connection")).toBeNull();
		expect((init.headers as Headers).get("content-type")).toBe("application/json");
	});
});
