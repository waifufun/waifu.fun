/**
 * Authentication helpers.
 *
 * The waifu.fun frontend gates `/patron/*` and `/create/*` behind a
 * lightweight cookie (`wf_authed=1`) read by `useWaifuAuth`. The actual
 * Steward JWT lives in an HttpOnly cookie set by /api/auth/finalize,
 * which we don't run in tests.
 *
 * For e2e we:
 *   1. Set `wf_authed=1` as a non-HttpOnly cookie so the gate passes.
 *   2. Mock `GET /v3/patron/me` so `useWaifuAuth` resolves to an
 *      "authenticated" state without hitting the real auth backend.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { API_HOST } from "./api-mock";
import { TEST_ADDRESS } from "./wallet";

export const TEST_PATRON_ID = "patron-test-1";

export async function setAuthedCookie(context: BrowserContext, baseURL: string): Promise<void> {
	const url = new URL(baseURL);
	await context.addCookies([
		{
			name: "wf_authed",
			value: "1",
			domain: url.hostname,
			path: "/",
			httpOnly: false,
			secure: false,
			sameSite: "Lax",
		},
	]);
}

export async function mockPatronMe(
	page: Page,
	overrides: Partial<{ address: string; agentCount: number }> = {},
): Promise<void> {
	const address = overrides.address ?? TEST_ADDRESS;
	const agentCount = overrides.agentCount ?? 0;
	await page.route(`${API_HOST}/v3/patron/me`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				patron: {
					id: TEST_PATRON_ID,
					stewardUserId: "steward-test-1",
					email: null,
					primaryAddress: address,
					primaryChain: "evm",
				},
				wallets: [
					{
						id: "wallet-test-1",
						address,
						chainId: 56,
						chainNamespace: "evm",
						isPrimary: true,
						linkedAt: new Date().toISOString(),
					},
				],
				agentCount,
				primaryAddress: address,
				primaryChain: "evm",
				linkedWallets: [{ address, addedAt: new Date().toISOString() }],
			}),
		}),
	);
}

/**
 * Convenience: set cookie + mock /v3/patron/me. Most authenticated
 * tests want both.
 */
export async function signIn(
	context: BrowserContext,
	page: Page,
	baseURL: string,
	overrides?: Parameters<typeof mockPatronMe>[1],
): Promise<void> {
	await setAuthedCookie(context, baseURL);
	await mockPatronMe(page, overrides);
}
