import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./login/route";

describe("twitter login route", () => {
	it("redirects to the backend twitter login with a safe return path", () => {
		const response = GET(new NextRequest("https://www.waifu.fun/auth/twitter/login?return_to=/patron/wallets"));

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://api.waifu.fun/auth/twitter/login?return_to=%2Fpatron%2Fwallets",
		);
	});

	it("rejects absolute or protocol-relative return targets", () => {
		const response = GET(new NextRequest("https://www.waifu.fun/auth/twitter/login?return_to=https://evil.test"));

		expect(response.headers.get("location")).toBe("https://api.waifu.fun/auth/twitter/login?return_to=%2Fpatron");
	});

	it("rejects encoded slash and backslash return targets", () => {
		for (const returnTo of ["/%2fevil.test", "/%5cevil.test"]) {
			const response = GET(
				new NextRequest(`https://www.waifu.fun/auth/twitter/login?return_to=${encodeURIComponent(returnTo)}`),
			);

			expect(response.headers.get("location")).toBe("https://api.waifu.fun/auth/twitter/login?return_to=%2Fpatron");
		}
	});
});
