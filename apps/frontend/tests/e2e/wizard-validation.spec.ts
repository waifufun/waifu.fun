import { expect, test } from "@playwright/test";
import { installDefaultMocks } from "./fixtures/api-mock";
import { signIn } from "./fixtures/auth";
import { injectWallet } from "./fixtures/wallet";

/**
 * Validation gating: confirms the wizard does not let an empty-state
 * user advance past the persona step.
 *
 * The "next" button uses the `disabled` attribute (driven by
 * `useStepValid`). We assert disabled, not a specific error label,
 * so this test stays stable as copy evolves.
 */
test.describe("/create/wizard validation", () => {
	test("next button stays disabled until persona fields filled", async ({ context, page, baseURL }) => {
		await injectWallet(page);
		await installDefaultMocks(page);
		await signIn(context, page, baseURL ?? "http://127.0.0.1:3100");

		await page.goto("/create/wizard?step=persona");

		const nextBtn = page.getByRole("button", { name: /^next$/i });
		await expect(nextBtn).toBeVisible();
		await expect(nextBtn).toBeDisabled();

		// Switch to "create from scratch" so name/ticker/bio inputs render.
		await page.getByRole("button", { name: /\[create\]/i }).click();

		// Invite code is OPTIONAL as of wave H. Name/ticker/bio are the real gate.
		await expect(nextBtn).toBeDisabled();

		// Fill the persona name + ticker + bio. Now next should be enabled.
		// `getByPlaceholder('Eliza')` matches the persona-prompt textarea too
		// (its placeholder starts with "You are Eliza."), so we scope by role
		// and accessible name to avoid strict-mode violations.
		await page.getByRole("textbox", { name: "name" }).fill("Test Agent");
		await page.getByRole("textbox", { name: "ticker" }).fill("TEST");
		await page.getByPlaceholder(/reluctant treasury manager/i).fill("A test agent for the e2e harness.");

		await expect(nextBtn).toBeEnabled();
	});
});
