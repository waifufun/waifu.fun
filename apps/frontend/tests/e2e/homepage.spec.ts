import { expect, test } from "@playwright/test";
import { installDefaultMocks } from "./fixtures/api-mock";

test.describe("homepage", () => {
	test.beforeEach(async ({ page }) => {
		await installDefaultMocks(page);
	});

	test("renders hero with primary CTAs", async ({ page }) => {
		await page.goto("/");

		await page.waitForLoadState("domcontentloaded");

		// Hero CTAs render inside `<a>` elements but the text lives in
		// `<motion.div>` reveal wrappers. The header also links to
		// /give-skill ("launch agent") and /agents ("browse agents"), so
		// we filter on the hero's exact CTA copy and accept >=1 match.
		const heroGiveSkill = page.locator('a[href="/give-skill"]').filter({ hasText: /give.*skill/i });
		await expect(heroGiveSkill.first()).toBeAttached({ timeout: 15_000 });

		const heroBrowse = page.locator('a[href="/agents"]').filter({ hasText: /browse agents/i });
		await expect(heroBrowse.first()).toBeAttached();
	});

	test("footer links resolve to internal pages", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		// Footer is conditionally rendered client-side by FooterConditional
		// after hydration. Wait for it to appear before we probe its links.
		const footer = page.locator("footer").first();
		await footer.waitFor({ state: "attached", timeout: 15_000 });
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		const internalHrefs = [
			"/agents",
			"/launches",
			"/quickstart",
			"/litepaper",
			"/privacy-policy",
			"/support",
			"/terms-of-service",
		];

		for (const href of internalHrefs) {
			const link = footer.locator(`a[href="${href}"]`).first();
			await expect(link, `footer link to ${href}`).toBeAttached();
		}
	});

	test("page title is set", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/waifu\.fun/i);
	});
});
