import { expect, test } from "@playwright/test";
import { installDefaultMocks } from "./fixtures/api-mock";
import { signIn } from "./fixtures/auth";
import { injectWallet } from "./fixtures/wallet";

/**
 * Portfolio empty-state tests.
 *
 * Two paths produce an empty-state today:
 *   1. The page has no connected EVM wallet (`useAddress()` returns
 *      undefined) → "connect a wallet first."
 *   2. Wallet is connected but the backend returns zero entries →
 *      "no positions yet."
 *
 * (1) is reachable without wallet wiring; (2) requires wagmi to be in
 * a connected state, which is harder to mock deterministically without
 * driving the RainbowKit connect modal. We cover (1) here and rely on
 * unit tests + manual QA for (2).
 */
test.describe("/patron/portfolio empty state", () => {
	test("shows 'connect a wallet first' when no wallet connected", async ({ context, page, baseURL }) => {
		await injectWallet(page);
		await installDefaultMocks(page);
		await signIn(context, page, baseURL ?? "http://127.0.0.1:3100");

		await page.goto("/patron/portfolio");

		await expect(page.getByText(/connect a wallet first/i)).toBeVisible();
		const linkWallet = page.getByRole("link", { name: /link a wallet/i });
		await expect(linkWallet).toBeVisible();
		await expect(linkWallet).toHaveAttribute("href", "/patron/wallets");
	});

	test("auth gate blocks anonymous users", async ({ page }) => {
		// No signIn() → no wf_authed cookie. ProtectedShell should
		// render the "Sign in required" gate, not the portfolio.
		await installDefaultMocks(page);
		await page.goto("/patron/portfolio");

		await expect(page.getByText(/sign in required/i)).toBeVisible();
		// The gate renders a "Sign in" button next to the heading; the
		// header also has a "sign in" pill, so we scope to the gate panel.
		const gateSignIn = page.getByRole("button", { name: "Sign in", exact: true });
		await expect(gateSignIn).toBeVisible();
	});
});
