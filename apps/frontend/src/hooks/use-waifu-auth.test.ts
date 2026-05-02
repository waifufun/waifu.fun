import { describe, expect, it, vi } from "vitest";
import { fetchWaifuMe, hasWaifuAuthCookie } from "./use-waifu-auth";

describe("useWaifuAuth helpers", () => {
	it("treats a missing cookie as unauthenticated", () => {
		expect(hasWaifuAuthCookie("other=1")).toBe(false);
	});

	it("treats a present cookie with a failing me request as unauthenticated", async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 }));
		expect(hasWaifuAuthCookie("wf_authed=1")).toBe(true);
		await expect(fetchWaifuMe(fetcher as unknown as typeof fetch)).resolves.toBeNull();
	});

	it("hydrates the primary address when the me request succeeds", async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						primaryAddress: "0x1234567890123456789012345678901234567890",
						linkedWallets: [],
					}),
					{ status: 200 },
				),
		);
		const me = await fetchWaifuMe(fetcher as unknown as typeof fetch);
		expect(me?.primaryAddress).toBe("0x1234567890123456789012345678901234567890");
	});
});
