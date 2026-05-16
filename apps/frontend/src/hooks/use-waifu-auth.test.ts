import { describe, expect, it, vi } from "vitest";
import { fetchWaifuMe, hasWaifuAuthCookie } from "./use-waifu-auth";

describe("useWaifuAuth helpers", () => {
	it("treats a missing cookie as unauthenticated", () => {
		expect(hasWaifuAuthCookie("other=1")).toBe(false);
	});

	it("only treats an exact wf_authed=1 cookie as the cosmetic auth hint", () => {
		expect(hasWaifuAuthCookie("wf_authed=10")).toBe(false);
		expect(hasWaifuAuthCookie("wf_authed=1abc")).toBe(false);
		expect(hasWaifuAuthCookie("other=1; wf_authed=1")).toBe(true);
	});

	it("treats a present cookie with a failing me request as unauthenticated", async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 500 }));
		expect(hasWaifuAuthCookie("wf_authed=1")).toBe(true);
		await expect(fetchWaifuMe(fetcher as unknown as typeof fetch)).resolves.toBeNull();
	});

	it("sends credentials on the authoritative patron lookup", async () => {
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						primaryAddress: "0x1234567890123456789012345678901234567890",
						primaryChain: "evm",
						linkedWallets: [],
					}),
					{ status: 200 },
				),
		);
		await fetchWaifuMe(fetcher as unknown as typeof fetch);
		expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
	});

	it("hydrates the primary address when the me request succeeds", async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						primaryAddress: "0x1234567890123456789012345678901234567890",
						primaryChain: "evm",
						linkedWallets: [],
					}),
					{ status: 200 },
				),
		);
		const me = await fetchWaifuMe(fetcher as unknown as typeof fetch);
		expect(me?.primaryAddress).toBe("0x1234567890123456789012345678901234567890");
		expect(me?.primaryChain).toBe("evm");
	});

	it("hydrates a solana primary address", async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						primaryAddress: "7wF6Y7uqud2JjVnBvVADHXoEDGdYpP9vF4zXnU5nFQeA",
						primaryChain: "solana",
						linkedWallets: [],
					}),
					{ status: 200 },
				),
		);
		const me = await fetchWaifuMe(fetcher as unknown as typeof fetch);
		expect(me?.primaryAddress).toBe("7wF6Y7uqud2JjVnBvVADHXoEDGdYpP9vF4zXnU5nFQeA");
		expect(me?.primaryChain).toBe("solana");
	});
});
