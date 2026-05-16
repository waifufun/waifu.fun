import { expect, test } from "@playwright/test";
import { installDefaultMocks } from "./fixtures/api-mock";
import { signIn } from "./fixtures/auth";
import { TEST_ADDRESS, injectWallet } from "./fixtures/wallet";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ROUTES = [
	{ path: "/", label: "home" },
	{ path: "/admin", label: "admin" },
	{ path: "/admin/moderators", label: "admin moderators" },
	{ path: "/admin/ops", label: "admin ops" },
	{ path: "/admin/ops/audit", label: "admin ops audit" },
	{ path: "/admin/tokens", label: "admin tokens" },
	{ path: "/admin/users", label: "admin users" },
	{ path: `/agent/${ZERO_ADDRESS}`, label: "agent detail", allowStatus: [200, 404] },
	{ path: "/agents", label: "agents index" },
	{ path: "/auth/callback", label: "auth callback" },
	{ path: "/auth/connect", label: "auth connect" },
	{ path: "/auth/email/verify?token=test&email=test%40waifu.fun", label: "email verify" },
	{ path: "/auth/oauth/callback?token=test", label: "oauth callback" },
	{ path: "/auth/steward/callback?token=test", label: "steward callback" },
	{ path: "/auth/twitter/finalize?code=test", label: "twitter finalize" },
	{ path: "/claim/_", label: "claim placeholder" },
	{ path: "/create", label: "create" },
	{ path: "/create/wizard", label: "create wizard" },
	{ path: "/fees", label: "fees" },
	{ path: "/give-skill", label: "give skill" },
	{ path: "/launch/_", label: "launch placeholder" },
	{ path: "/launches", label: "launches" },
	{ path: "/leaderboard", label: "leaderboard" },
	{ path: "/litepaper", label: "litepaper" },
	{ path: "/patron", label: "patron dashboard" },
	{ path: `/patron/${ZERO_ADDRESS}`, label: "patron agent" },
	{ path: `/patron/${ZERO_ADDRESS}/x/callback?oauth_token=test`, label: "patron x callback" },
	{ path: "/patron/portfolio", label: "patron portfolio" },
	{ path: "/patron/wallets", label: "patron wallets" },
	{ path: "/privacy-policy", label: "privacy policy" },
	{ path: `/profile/${TEST_ADDRESS}`, label: "profile", allowStatus: [200, 404] },
	{ path: `/profile/${TEST_ADDRESS}/components`, label: "profile components", allowStatus: [200, 404] },
	{ path: "/quickstart", label: "quickstart" },
	{ path: "/story", label: "story" },
	{ path: "/support", label: "support" },
	{ path: "/terms-of-service", label: "terms" },
	{ path: `/token/evm/1/${ZERO_ADDRESS}`, label: "token detail" },
	{ path: `/token/evm/1/${ZERO_ADDRESS}/agents`, label: "token agents" },
	{ path: `/token/evm/1/${ZERO_ADDRESS}/chat`, label: "token chat" },
	{ path: `/token/evm/1/${ZERO_ADDRESS}/create`, label: "token create" },
	{ path: `/token/evm/1/${ZERO_ADDRESS}/holders`, label: "token holders" },
] as const;

test.describe("page route smoke coverage", () => {
	test.beforeEach(async ({ baseURL, context, page }) => {
		await installDefaultMocks(page);
		await signIn(context, page, baseURL ?? "http://127.0.0.1:3100");
		await injectWallet(context);
	});

	for (const route of ROUTES) {
		test(`${route.label}: ${route.path}`, async ({ page }) => {
			const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
			const status = response?.status() ?? 0;
			const allowed = "allowStatus" in route ? route.allowStatus : [200];

			expect(status, `${route.path} should return an expected HTTP status`).toBeGreaterThanOrEqual(200);
			expect(allowed, `${route.path} returned ${status}`).toContain(status);
			await expect(page.locator("body")).not.toBeEmpty({ timeout: 15_000 });
			await expect(page.locator("body")).not.toContainText(/application error|server error|client-side exception/i);
		});
	}
});
